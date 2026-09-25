"""CLI: calcula dNBR via Sentinel-2/GEE pra um grupo de municípios, grava
`area_dnbr_km2` em metricas_anuais.

    python -m pipeline.run_dnbr --grupo 1 --de-grupos 2

Pensado pra rodar mensalmente, dividido em jobs paralelos
(`process-sentinel-dnbr.yml`, docs/DECISIONS.md seção 2.1) — `--grupo`/
`--de-grupos` particiona os municípios (ordenados por codigo_ibge) em N
fatias aproximadamente iguais, uma por job.

Compara Sentinel-2 do mês anterior ("antes") contra o mês corrente
("depois") — generalização mensal contínua do método de pesquisa (que
comparava julho/setembro em torno do evento de agosto/2024, pulando o
próprio mês do evento). Uma cadência mensal contínua não tem um "mês do
evento" fixo pra pular no meio; comparar mês a mês direto é a extensão mais
direta, mas é uma decisão nova, não extraída de nenhum notebook — ver
docs/DECISIONS.md seção 6.14.

`area_dnbr_km2` = área com dNBR acima do menor limiar de evidência
espectral (0,10 — "fraca" em diante, pipeline/dnbr/constants.py), calculada
diretamente no servidor do Earth Engine via `reduceRegion` (síncrono — não
depende de exportar/baixar GeoTIFF do Drive, ao contrário dos notebooks
originais). Arquivo GeoTIFF pra arquivo/visualização é uma extensão futura
(ver pipeline/README.md).

NÃO EXECUTÁVEL/TESTÁVEL nesta sessão — precisa de rede e credenciais do
Earth Engine indisponíveis neste sandbox de propósito (mesma limitação de
`dnbr/sentinel2.py`). `janela_mes_anterior` e `dividir_em_grupo` (lógica
pura, sem GEE) têm testes em tests/pipeline/test_run_dnbr.py.
"""

import argparse
import json
import os
from datetime import date, timedelta

import pandas as pd

from pipeline.common.db import get_connection
from pipeline.dnbr.constants import LIMIARES_SEVERIDADE

GEE_PROJECT_ID = "concrete-bloom-374223"
LIMIAR_AREA_QUEIMADA = LIMIARES_SEVERIDADE[0]


def inicializar_gee() -> None:
    import ee

    chave_json = os.environ["GEE_SERVICE_ACCOUNT_KEY"]
    credenciais_dict = json.loads(chave_json)
    credenciais = ee.ServiceAccountCredentials(credenciais_dict["client_email"], key_data=chave_json)
    ee.Initialize(credenciais, project=os.environ.get("GEE_PROJECT_ID", GEE_PROJECT_ID))


def janela_mes_anterior(hoje: date) -> tuple[tuple[str, str], tuple[str, str]]:
    """(janela "antes" = mês anterior inteiro, janela "depois" = mês
    corrente até hoje)."""
    primeiro_dia_mes_atual = hoje.replace(day=1)
    ultimo_dia_mes_anterior = primeiro_dia_mes_atual - timedelta(days=1)
    primeiro_dia_mes_anterior = ultimo_dia_mes_anterior.replace(day=1)

    janela_antes = (primeiro_dia_mes_anterior.isoformat(), primeiro_dia_mes_atual.isoformat())
    janela_depois = (primeiro_dia_mes_atual.isoformat(), hoje.isoformat())
    return janela_antes, janela_depois


def dividir_em_grupo(municipios: pd.DataFrame, grupo: int, de_grupos: int) -> pd.DataFrame:
    """Fatia `grupo`-ésima (1-indexado) de `de_grupos` fatias intercaladas —
    ordenacao por codigo_ibge ja vem de _buscar_municipios, entao o
    resultado e deterministico e sem sobreposicao entre jobs."""
    if not 1 <= grupo <= de_grupos:
        raise ValueError(f"grupo deve estar entre 1 e {de_grupos}, recebi {grupo}")
    return municipios.iloc[grupo - 1 :: de_grupos].reset_index(drop=True)


def calcular_area_queimada_km2(dnbr_imagem, area, scale: int = 20) -> float:
    import ee

    queimado_km2 = dnbr_imagem.gte(LIMIAR_AREA_QUEIMADA).multiply(ee.Image.pixelArea().divide(1_000_000))
    stats = queimado_km2.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=area, scale=scale, maxPixels=1e10, bestEffort=True
    ).getInfo()
    return float(stats.get("dNBR") or 0.0)


def processar_municipio(codigo_ibge: str, nome: str, janela_antes: tuple, janela_depois: tuple) -> float | None:
    from shapely.geometry import mapping

    import ee

    from pipeline.common.ibge_malhas import buscar_geometria_municipio
    from pipeline.dnbr.sentinel2 import SemImagemValida, calcular_dnbr

    geom_shapely = buscar_geometria_municipio(codigo_ibge)
    area_ee = ee.Geometry(mapping(geom_shapely))

    try:
        resultado = calcular_dnbr(area_ee, janela_antes, janela_depois)
    except SemImagemValida as e:
        print(f"[PULADO] {nome} ({codigo_ibge}): {e}")
        return None

    return round(calcular_area_queimada_km2(resultado.imagem, area_ee), 2)


def _buscar_municipios(conn) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute("SELECT codigo_ibge, nome FROM municipios ORDER BY codigo_ibge")
        linhas = cur.fetchall()
    return pd.DataFrame(linhas, columns=["codigo_ibge", "nome"])


def _gravar_area_dnbr(conn, codigo_ibge: str, ano: int, area_dnbr_km2: float) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO metricas_anuais (codigo_ibge, ano, area_dnbr_km2)
            VALUES (%(codigo_ibge)s, %(ano)s, %(area_dnbr_km2)s)
            ON CONFLICT (codigo_ibge, ano) DO UPDATE SET
                area_dnbr_km2 = EXCLUDED.area_dnbr_km2,
                atualizado_em = now()
            """,
            {"codigo_ibge": codigo_ibge, "ano": ano, "area_dnbr_km2": area_dnbr_km2},
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grupo", type=int, required=True, help="1-indexado (ex.: 1 ou 2 pra 2 jobs)")
    parser.add_argument("--de-grupos", type=int, required=True)
    parser.add_argument("--ano", type=int, default=date.today().year)
    args = parser.parse_args()

    inicializar_gee()
    janela_antes, janela_depois = janela_mes_anterior(date.today())

    with get_connection() as conn:
        municipios = _buscar_municipios(conn)
    fatia = dividir_em_grupo(municipios, args.grupo, args.de_grupos)

    print(f"Grupo {args.grupo}/{args.de_grupos}: {len(fatia)} municípios. Janelas: {janela_antes} -> {janela_depois}")

    # Conexao curta por municipio (nao 1 unica transacao pros ~320 municipios
    # do grupo, que rodam por horas — ver docs/DECISIONS.md secao 6.14):
    # progresso ja gravado sobrevive se um municipio mais a frente falhar ou
    # a conexao cair no meio do job.
    for _, row in fatia.iterrows():
        try:
            area_km2 = processar_municipio(row["codigo_ibge"], row["nome"], janela_antes, janela_depois)
        except Exception as e:
            print(f"[ERRO] {row['codigo_ibge']} ({row['nome']}): {type(e).__name__}: {e}")
            continue

        if area_km2 is None:
            continue

        with get_connection() as conn:
            _gravar_area_dnbr(conn, row["codigo_ibge"], args.ano, area_km2)
        print(f"{row['codigo_ibge']} ({row['nome']}): area_dnbr_km2={area_km2}")


if __name__ == "__main__":
    main()
