"""CLI: consulta ad-hoc de 1 município x 1 mês, disparada pelo visitante do
/webapp (docs/DECISIONS.md seção 6.43) — nunca pelo cron.

    python -m pipeline.run_consulta_sob_demanda --consulta-id 42 --municipio 3539509 --ano 2025 --mes 6

Diferente de `run_ingest_stdbscan.py`/`run_dnbr.py` (agregado ANUAL, rodam
sozinhos em lote pros 645 municípios): aqui o /webapp já insere a linha em
`consultas_sob_demanda` (status='pendente') e dispara este script via
`workflow_dispatch` do GitHub Actions (`consulta-sob-demanda.yml`) passando
o id — este script só ATUALIZA aquela linha (processando -> concluido/erro),
nunca grava em `metricas_anuais` (que continua sendo o dado anual oficial).

Sem confiabilidade/MapBiomas — só ST-DBSCAN + dNBR, os dois únicos métodos
que fazem sentido calcular ao vivo pra um recorte mensal (MapBiomas Fogo é
anual e só até 2024, ver seção 6.22). `min_samples` é fixo em 4 (não usa a
fórmula de anomalia de `calcular_min_samples`, calibrada pra comparar o ano
inteiro contra o teto histórico anual — não se aplica a um recorte de 1 mês
só; decisão de simplificação desta sessão, não pedida explicitamente a
Pedro, documentada em docs/DECISIONS.md seção 6.43).

dNBR reaproveita `run_dnbr.py::processar_municipio` inalterado, só trocando
a janela: `janela_mes_especifico(ano, mes)` no lugar de
`janela_mes_anterior(date.today())`. Já herda de lá o comportamento de
"sem imagem válida (nuvem) -> None, sem derrubar a consulta" e o upload
opcional da miniatura pro R2 se os secrets estiverem configurados.

NÃO EXECUTÁVEL/TESTÁVEL nesta sessão (mesma limitação de sempre — GEE e
INPE reais só respondem a partir do GitHub Actions/rede do Pedro). Testado
aqui: só a lógica pura (validação de mês, filtro por mês, helpers de SQL
com conexão mockada) — ver tests/pipeline/test_run_consulta_sob_demanda.py.
"""

import argparse
from pathlib import Path

import pandas as pd

from pipeline.common.db import get_connection
from pipeline.ingest.inpe import baixar_focos_ano, carregar_focos_sp
from pipeline.run_dnbr import inicializar_gee, janela_mes_especifico, processar_municipio
from pipeline.stdbscan.core import ParametrosStDbscan, resumir_eventos, rodar_stdbscan

# Recorte de 1 mês não tem "teto histórico anual" pra comparar (a fórmula de
# calcular_min_samples precisa de um ano inteiro) — fixo no valor "padrão"
# do método (usado em 51 dos 63 municípios da amostra validada, seção 6.11),
# não o valor reduzido (2) reservado pra sinal fraco/teste de limite.
MIN_SAMPLES_CONSULTA = 4

# Versão do método gravada com cada resultado. 1 = todos os satélites do
# INPE (até 27/09/2026); 2 = só o satélite de referência, como a pesquisa
# (docs/DECISIONS.md seção 6.53). O /webapp só reaproveita resultados da
# versão atual (VERSAO_METODO_CONSULTA em webapp/src/lib/consultaSobDemanda.ts).
VERSAO_METODO = 2


def _garantir_tabela(conn) -> None:
    """Migração idempotente — schema.sql é aplicado manualmente no Neon
    (docs/DECISIONS.md seção 6.6), e desta vez o /webapp escreve a PRIMEIRA
    linha (antes deste script rodar), então a tabela precisa existir dos
    dois lados. Mesmo padrão de _garantir_coluna_fonte/_garantir_coluna_imagem,
    mas CREATE TABLE em vez de ALTER — mantido em sincronia manual com
    schema.sql (fonte de verdade)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS consultas_sob_demanda (
                id                  BIGSERIAL PRIMARY KEY,
                codigo_ibge         CHAR(7) NOT NULL REFERENCES municipios (codigo_ibge),
                ano                 SMALLINT NOT NULL,
                mes                 SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
                status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
                num_focos_calor     INT,
                num_agrupamentos    INT,
                area_st_dbscan_km2  NUMERIC(10, 2),
                area_dnbr_km2       NUMERIC(10, 2),
                dnbr_imagem_url     TEXT,
                mensagem_erro       TEXT,
                ip_solicitante      TEXT,
                criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
                concluido_em        TIMESTAMPTZ,
                versao_metodo       SMALLINT NOT NULL DEFAULT 1
            )
            """
        )
        # Tabela criada antes da seção 6.53 não tem a coluna.
        cur.execute(
            "ALTER TABLE consultas_sob_demanda "
            "ADD COLUMN IF NOT EXISTS versao_metodo SMALLINT NOT NULL DEFAULT 1"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_consultas_sob_demanda_ip_criado "
            "ON consultas_sob_demanda (ip_solicitante, criado_em DESC)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_consultas_sob_demanda_municipio_periodo "
            "ON consultas_sob_demanda (codigo_ibge, ano, mes, status)"
        )


def _buscar_municipio(conn, codigo_ibge: str) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT codigo_ibge, nome FROM municipios WHERE codigo_ibge = %(codigo_ibge)s",
            {"codigo_ibge": codigo_ibge},
        )
        linha = cur.fetchone()
    if linha is None:
        raise ValueError(f"codigo_ibge={codigo_ibge!r} não encontrado em municipios.")
    return pd.DataFrame([linha], columns=["codigo_ibge", "nome"])


def _marcar_status(conn, consulta_id: int, status: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE consultas_sob_demanda SET status = %(status)s WHERE id = %(id)s",
            {"status": status, "id": consulta_id},
        )


def _marcar_erro(conn, consulta_id: int, mensagem: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE consultas_sob_demanda
            SET status = 'erro', mensagem_erro = %(mensagem)s, concluido_em = now()
            WHERE id = %(id)s
            """,
            {"mensagem": mensagem[:2000], "id": consulta_id},
        )


def _gravar_resultado(conn, consulta_id: int, resultado: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE consultas_sob_demanda
            SET status = 'concluido',
                num_focos_calor = %(num_focos_calor)s,
                num_agrupamentos = %(num_agrupamentos)s,
                area_st_dbscan_km2 = %(area_st_dbscan_km2)s,
                area_dnbr_km2 = %(area_dnbr_km2)s,
                dnbr_imagem_url = %(dnbr_imagem_url)s,
                versao_metodo = %(versao_metodo)s,
                concluido_em = now()
            WHERE id = %(id)s
            """,
            {"id": consulta_id, **resultado, "versao_metodo": VERSAO_METODO},
        )


def filtrar_focos_mes(focos_municipio: pd.DataFrame, mes: int) -> pd.DataFrame:
    """Recorte de 1 mês sobre os focos já filtrados pro município/ano alvo
    (carregar_focos_sp já traz a coluna `mes`) — função própria só pra ficar
    testável sem precisar montar um DataFrame inteiro de CSV."""
    return focos_municipio[focos_municipio["mes"] == mes]


def processar_consulta(codigo_ibge: str, ano: int, mes: int, pasta_focos: Path) -> dict:
    if not 1 <= mes <= 12:
        raise ValueError(f"mes={mes} fora do intervalo 1-12")

    with get_connection() as conn:
        municipio_df = _buscar_municipio(conn, codigo_ibge)
    nome = municipio_df.iloc[0]["nome"]

    caminho_csv = baixar_focos_ano(ano, pasta_focos)
    focos_municipio = carregar_focos_sp(caminho_csv, municipio_df)
    focos_periodo = filtrar_focos_mes(focos_municipio, mes)

    parametros = ParametrosStDbscan(min_samples=MIN_SAMPLES_CONSULTA)
    clusterizado = rodar_stdbscan(focos_periodo, parametros)
    eventos = resumir_eventos(clusterizado, parametros.eps_space_km)

    inicializar_gee()
    janela_antes, janela_depois = janela_mes_especifico(ano, mes)
    # debug=True liga os prints [DEBUG] já existentes em processar_municipio
    # (nº de cenas Sentinel-2, cobertura de nuvem) — útil nos logs do Actions
    # pra diagnosticar sem precisar reproduzir localmente.
    resultado_dnbr = processar_municipio(codigo_ibge, nome, janela_antes, janela_depois, ano, mes, debug=True)
    area_dnbr_km2, dnbr_imagem_url = resultado_dnbr if resultado_dnbr else (None, None)

    return {
        "num_focos_calor": len(focos_periodo),
        "num_agrupamentos": len(eventos),
        "area_st_dbscan_km2": round(float(eventos["area_km2"].sum()), 2) if not eventos.empty else 0.0,
        "area_dnbr_km2": area_dnbr_km2,
        "dnbr_imagem_url": dnbr_imagem_url,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--consulta-id", type=int, required=True)
    parser.add_argument("--municipio", required=True, help="Código IBGE (7 dígitos)")
    parser.add_argument("--ano", type=int, required=True)
    parser.add_argument("--mes", type=int, required=True)
    parser.add_argument("--pasta-focos", type=Path, default=Path("focos_cache_consulta"))
    args = parser.parse_args()

    with get_connection() as conn:
        _garantir_tabela(conn)
        _marcar_status(conn, args.consulta_id, "processando")
    print(f"Consulta {args.consulta_id}: processando {args.municipio} {args.ano}-{args.mes:02d}")

    try:
        resultado = processar_consulta(args.municipio, args.ano, args.mes, args.pasta_focos)
    except Exception as e:
        mensagem = f"{type(e).__name__}: {e}"
        print(f"[ERRO] consulta {args.consulta_id}: {mensagem}")
        with get_connection() as conn:
            _marcar_erro(conn, args.consulta_id, mensagem)
        raise

    with get_connection() as conn:
        _gravar_resultado(conn, args.consulta_id, resultado)
    print(f"Consulta {args.consulta_id}: concluída — {resultado}")


if __name__ == "__main__":
    main()
