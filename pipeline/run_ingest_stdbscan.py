"""CLI: ingestao INPE + ST-DBSCAN pro ano corrente, grava em metricas_anuais.

    python -m pipeline.run_ingest_stdbscan --ano 2024 --pasta-focos ./focos_csv

Pensado pra rodar diariamente (`ingest-inpe.yml`, docs/DECISIONS.md secao
1.1/2.5): `--ano` e sempre o ano corrente, reprocessado do zero a cada
execucao (idempotente via UPSERT) conforme mais focos daquele ano vao
ficando disponiveis no INPE — nao e restrito a agosto nem a nenhum outro
mes. `num_focos_calor`/`num_agrupamentos` de um (municipio, ano) sao o total
do ano inteiro ate a data do processamento, nao um recorte mensal (decisao
confirmada com o Pedro em 25/09/2026, ver docs/DECISIONS.md secao 6.13 —
corrige a suposicao inicial, copiada direto da pesquisa, de comparar sempre
agosto contra agosto).

Espera em `--pasta-focos` um CSV bruto do INPE por ano (`focos_anual_br_AAAA.csv`
ou equivalente ja filtrado) cobrindo o ano alvo e pelo menos os 6 anos
anteriores (pra calcular o teto historico anual usado em
`calcular_min_samples` — docs/DECISIONS.md secao 6.11/6.12/6.13). Baixa o que
faltar via `pipeline.ingest.inpe.baixar_focos_ano` se `--baixar-faltantes`
for passado.

Fluxo completo (leitura de CSVs sinteticos + calculo + escrita real via
UPSERT) validado nesta sessao contra o Postgres local de desenvolvimento
(docs/DECISOES.md secao 6.12) — o que falta validar e so o download real do
INPE (URL/schema de coluna nao confirmados, ver pipeline/ingest/inpe.py) e a
escrita no Neon de producao (sandbox sem rede pra Neon, secao 6.9).
"""

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

from pipeline.common.db import get_connection
from pipeline.ingest.inpe import baixar_focos_ano, carregar_focos_sp
from pipeline.stdbscan.core import ParametrosStDbscan, calcular_min_samples, resumir_eventos, rodar_stdbscan

ANOS_HISTORICO = 6  # 2018-2023 pra um alvo de 2024, por exemplo


def calcular_teto_historico(focos_municipio_todos_anos: pd.DataFrame, ano_alvo: int) -> int:
    """Maior total ANUAL de focos entre os anos anteriores a `ano_alvo`
    presentes nos dados. 0 se nao houver nenhum ano anterior."""
    historico = focos_municipio_todos_anos[focos_municipio_todos_anos["ano"] < ano_alvo]
    if historico.empty:
        return 0
    contagem_por_ano = historico.groupby("ano").size()
    return int(contagem_por_ano.max())


def _buscar_municipios(conn) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute("SELECT codigo_ibge, nome FROM municipios ORDER BY codigo_ibge")
        linhas = cur.fetchall()
    return pd.DataFrame(linhas, columns=["codigo_ibge", "nome"])


def _gravar_metricas(conn, codigo_ibge: str, ano: int, resultado: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO metricas_anuais
                (codigo_ibge, ano, num_focos_calor, num_agrupamentos,
                 area_st_dbscan_km2, eps_space_km, eps_time_days, min_samples)
            VALUES (%(codigo_ibge)s, %(ano)s, %(num_focos_calor)s, %(num_agrupamentos)s,
                    %(area_st_dbscan_km2)s, %(eps_space_km)s, %(eps_time_days)s, %(min_samples)s)
            ON CONFLICT (codigo_ibge, ano) DO UPDATE SET
                num_focos_calor = EXCLUDED.num_focos_calor,
                num_agrupamentos = EXCLUDED.num_agrupamentos,
                area_st_dbscan_km2 = EXCLUDED.area_st_dbscan_km2,
                eps_space_km = EXCLUDED.eps_space_km,
                eps_time_days = EXCLUDED.eps_time_days,
                min_samples = EXCLUDED.min_samples,
                atualizado_em = now()
            """,
            {"codigo_ibge": codigo_ibge, "ano": ano, **resultado},
        )


def processar_municipio(focos_municipio_todos_anos: pd.DataFrame, ano_alvo: int) -> dict:
    """ST-DBSCAN de um municipio pro ano alvo inteiro (nao um mes especifico
    — docs/DECISIONS.md secao 6.13), com min_samples decidido pela formula
    de anomalia. Retorna as colunas prontas pra metricas_anuais."""
    focos_periodo = focos_municipio_todos_anos[focos_municipio_todos_anos["ano"] == ano_alvo]
    teto_historico = calcular_teto_historico(focos_municipio_todos_anos, ano_alvo)
    min_samples = calcular_min_samples(len(focos_periodo), teto_historico)

    parametros = ParametrosStDbscan(min_samples=min_samples)
    clusterizado = rodar_stdbscan(focos_periodo, parametros)
    eventos = resumir_eventos(clusterizado, parametros.eps_space_km)

    return {
        "num_focos_calor": len(focos_periodo),
        "num_agrupamentos": len(eventos),
        "area_st_dbscan_km2": round(float(eventos["area_km2"].sum()), 2) if not eventos.empty else 0.0,
        "eps_space_km": parametros.eps_space_km,
        "eps_time_days": parametros.eps_time_days,
        "min_samples": min_samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ano", type=int, default=date.today().year, help="Padrao: ano corrente (uso diario em producao)."
    )
    parser.add_argument("--pasta-focos", type=Path, required=True)
    parser.add_argument("--baixar-faltantes", action="store_true")
    args = parser.parse_args()

    anos = range(args.ano - ANOS_HISTORICO, args.ano + 1)
    if args.baixar_faltantes:
        for ano in anos:
            baixar_focos_ano(ano, args.pasta_focos, forcar=(ano == args.ano))

    with get_connection() as conn:
        municipios = _buscar_municipios(conn)

        focos_todos_anos = pd.concat(
            [
                carregar_focos_sp(args.pasta_focos / f"focos_anual_br_{ano}.csv", municipios)
                for ano in anos
                if (args.pasta_focos / f"focos_anual_br_{ano}.csv").exists()
            ],
            ignore_index=True,
        )

        for codigo_ibge, focos_municipio in focos_todos_anos.groupby("codigo_ibge"):
            resultado = processar_municipio(focos_municipio, args.ano)
            _gravar_metricas(conn, codigo_ibge, args.ano, resultado)
            print(f"{codigo_ibge}: {resultado}")


if __name__ == "__main__":
    main()
