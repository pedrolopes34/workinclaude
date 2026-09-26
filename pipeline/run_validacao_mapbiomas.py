"""CLI: compara ST-DBSCAN contra o MapBiomas Fogo (IoU, recall, permutação,
confiabilidade), grava em `validacao_mapbiomas`.

    python -m pipeline.run_validacao_mapbiomas --ano 2024 --pasta-focos ./focos_csv --grupo 1 --de-grupos 2

Pensado pra rodar quando uma nova coleção do MapBiomas Fogo é publicada
(anual, com defasagem — docs/DECISIONS.md seção 1.1); `check-mapbiomas.yml`
roda mensalmente mesmo assim (idempotente via UPSERT — se nada mudou no
MapBiomas, só reprocessa à toa) já que não há forma confirmada de checar
antecipadamente se saiu coleção nova. `--grupo`/`--de-grupos` particiona os
645 municípios (mesmo mecanismo de `run_dnbr.py`), por precaução de
desempenho — o custo real de 999 permutações × ~645 municípios nunca foi
medido nesta sessão.

Reconstrói o ST-DBSCAN a partir dos focos brutos pra obter a geometria do
agrupamento (decisão do Pedro, docs/DECISIONS.md seção 6.15 — mais simples
que persistir geometria no schema, e o recálculo é local/rápido, sem GEE).

NÃO EXECUTÁVEL/TESTÁVEL nesta sessão: precisa do INPE real (URL não
confirmada, seção 6.12), do asset do MapBiomas no GEE (não confirmado,
seção 6.15/6.16) e de rede/credenciais do Earth Engine. `pipeline/
validacao/mapbiomas.py` (IoU, permutação, confiabilidade) e `pipeline/
stdbscan/core.py::poligono_stdbscan_municipio` — as partes que isso
orquestra — estão testados isoladamente.
"""

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

from pipeline.common.db import get_connection
from pipeline.common.particionamento import dividir_em_grupo
from pipeline.ingest.inpe import carregar_focos_sp
from pipeline.run_ingest_stdbscan import calcular_teto_historico
from pipeline.stdbscan.core import ParametrosStDbscan, calcular_min_samples, poligono_stdbscan_municipio, resumir_eventos, rodar_stdbscan
from pipeline.validacao.mapbiomas import calcular_iou_recall, classificar_confiabilidade, permutacao_iou

ANOS_HISTORICO = 6
MAPBIOMAS_COLECAO = "Coleção 4"
# Confirmado por execução real (docs/DECISIONS.md seção 6.22): o asset da
# Coleção 4 tem exatamente 40 bandas = 1985-2024. Pedir um ano além disso
# derruba TODOS os municípios com "Invalid band number" — não é suposição.
ULTIMO_ANO_MAPBIOMAS_COLECAO4 = 2024


def inicializar_gee() -> None:
    from pipeline.run_dnbr import inicializar_gee as _inicializar

    _inicializar()


def _descrever_validacao_temporal(eventos: pd.DataFrame) -> str | None:
    if eventos.empty:
        return None
    inicio = eventos["data_inicio"].min()
    fim = eventos["data_fim"].max()
    return f"{len(eventos)} evento(s) entre {inicio:%d/%m/%Y} e {fim:%d/%m/%Y}"


def processar_municipio(
    codigo_ibge: str, nome: str, focos_todos_anos: pd.DataFrame, ano: int
) -> dict | None:
    """None se nao houver geometria de nenhum dos dois lados util pra
    comparar (ex.: municipio sem nenhum foco no ano — fica so com
    metricas_anuais.num_agrupamentos=0, confiabilidade "Insuficiente" e nem
    entra em validacao_mapbiomas, que so existe pra ano/municipio ja
    comparado — docs/DECISIONS.md secao 1.2)."""
    import ee
    from shapely.geometry import mapping

    from pipeline.common.ibge_malhas import buscar_geometria_municipio
    from pipeline.validacao.mapbiomas_gee import buscar_area_queimada

    focos_periodo = focos_todos_anos[focos_todos_anos["ano"] == ano]
    teto_historico = calcular_teto_historico(focos_todos_anos, ano)
    min_samples = calcular_min_samples(len(focos_periodo), teto_historico)

    clusterizado = rodar_stdbscan(focos_periodo, ParametrosStDbscan(min_samples=min_samples))
    eventos = resumir_eventos(clusterizado)

    if eventos.empty:
        return None  # sem agrupamento -> Insuficiente, ja coberto por metricas_anuais

    cluster_geom, epsg_metrico = poligono_stdbscan_municipio(clusterizado)

    geom_municipio = buscar_geometria_municipio(codigo_ibge)
    # Simplifica antes de virar ee.Geometry — o polígono "qualidade=maxima" do
    # IBGE tem provavelmente milhares de vértices; diagnosticado ao vivo (Pedro,
    # GEE Code Editor, docs/DECISIONS.md seção 6.25) que reduceToVectors volta 0
    # feições com a geometria REAL do município, mas funciona com um polígono
    # simples (círculo) ou com um limite administrativo de outra fonte
    # (FAO/GAUL, bem mais simplificado) nos mesmos parâmetros — suspeita é
    # complexidade/tamanho do payload do GeoJSON, não confirmada 100% contra a
    # fonte primária. Tolerância bem abaixo dos 30m de pixel do MapBiomas, não
    # perde precisão que importe pra essa comparação.
    geom_simplificada = geom_municipio.simplify(0.0001, preserve_topology=True)
    dominio_ee = ee.Geometry(mapping(geom_simplificada))
    mapbiomas_geom = buscar_area_queimada(dominio_ee, ano, epsg_metrico)

    resultado_iou = calcular_iou_recall(cluster_geom, mapbiomas_geom)
    _, p_valor = permutacao_iou(cluster_geom, mapbiomas_geom, _dominio_em_metros(geom_simplificada, epsg_metrico))

    confiabilidade = classificar_confiabilidade(len(eventos), resultado_iou.recall_pct, p_valor)
    complemento_mb_km2 = cluster_geom.difference(mapbiomas_geom).area / 1_000_000

    return {
        "area_mapbiomas_km2": round(mapbiomas_geom.area / 1_000_000, 2),
        "interseccao_pct": round(resultado_iou.iou * 100, 2),
        "p_valor": round(p_valor, 3),
        "n_permutacoes": 999,
        "recall_pct": round(resultado_iou.recall_pct, 2),
        "complemento_mb_km2": round(complemento_mb_km2, 2),
        "confiabilidade": confiabilidade,
        "validacao_temporal": _descrever_validacao_temporal(eventos),
        "mapbiomas_colecao": MAPBIOMAS_COLECAO,
        "data_comparacao": date.today(),
    }


def _dominio_em_metros(geom_municipio, epsg_metrico: int):
    import geopandas as gpd

    return gpd.GeoSeries([geom_municipio], crs="EPSG:4326").to_crs(epsg_metrico).iloc[0]


def _buscar_municipios(conn) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute("SELECT codigo_ibge, nome FROM municipios ORDER BY codigo_ibge")
        linhas = cur.fetchall()
    return pd.DataFrame(linhas, columns=["codigo_ibge", "nome"])


def _gravar_validacao(conn, codigo_ibge: str, ano: int, resultado: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO validacao_mapbiomas
                (codigo_ibge, ano, area_mapbiomas_km2, interseccao_pct, p_valor,
                 n_permutacoes, recall_pct, complemento_mb_km2, confiabilidade,
                 validacao_temporal, mapbiomas_colecao, data_comparacao)
            VALUES (%(codigo_ibge)s, %(ano)s, %(area_mapbiomas_km2)s, %(interseccao_pct)s, %(p_valor)s,
                    %(n_permutacoes)s, %(recall_pct)s, %(complemento_mb_km2)s, %(confiabilidade)s,
                    %(validacao_temporal)s, %(mapbiomas_colecao)s, %(data_comparacao)s)
            ON CONFLICT (codigo_ibge, ano) DO UPDATE SET
                area_mapbiomas_km2 = EXCLUDED.area_mapbiomas_km2,
                interseccao_pct = EXCLUDED.interseccao_pct,
                p_valor = EXCLUDED.p_valor,
                n_permutacoes = EXCLUDED.n_permutacoes,
                recall_pct = EXCLUDED.recall_pct,
                complemento_mb_km2 = EXCLUDED.complemento_mb_km2,
                confiabilidade = EXCLUDED.confiabilidade,
                validacao_temporal = EXCLUDED.validacao_temporal,
                mapbiomas_colecao = EXCLUDED.mapbiomas_colecao,
                data_comparacao = EXCLUDED.data_comparacao,
                atualizado_em = now()
            """,
            {"codigo_ibge": codigo_ibge, "ano": ano, **resultado},
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ano",
        type=int,
        default=ULTIMO_ANO_MAPBIOMAS_COLECAO4,
        help="Ano da coleção MapBiomas sendo processada (padrão: último ano coberto pela Coleção 4).",
    )
    parser.add_argument("--pasta-focos", type=Path, required=True)
    parser.add_argument("--grupo", type=int, default=1, help="1-indexado (ex.: 1 ou 2 pra 2 jobs)")
    parser.add_argument("--de-grupos", type=int, default=1)
    parser.add_argument("--baixar-faltantes", action="store_true")
    args = parser.parse_args()

    inicializar_gee()
    anos = range(args.ano - ANOS_HISTORICO, args.ano + 1)

    if args.baixar_faltantes:
        from pipeline.ingest.inpe import baixar_anos_necessarios

        baixar_anos_necessarios(anos, args.ano, args.pasta_focos, forcar_alvo=False)  # ano alvo ja fechado: nunca forcar

    with get_connection() as conn:
        todos_municipios = _buscar_municipios(conn)
    municipios = dividir_em_grupo(todos_municipios, args.grupo, args.de_grupos)

    focos_todos_anos = pd.concat(
        [
            carregar_focos_sp(args.pasta_focos / f"focos_anual_br_{ano}.csv", todos_municipios)
            for ano in anos
            if (args.pasta_focos / f"focos_anual_br_{ano}.csv").exists()
        ],
        ignore_index=True,
    )

    if focos_todos_anos.empty:
        raise SystemExit(
            f"Nenhum CSV de focos encontrado em {args.pasta_focos} pros anos {anos.start}-{anos.stop - 1}. "
            "Rode com --baixar-faltantes ou confira o cache do GitHub Actions."
        )

    print(f"Grupo {args.grupo}/{args.de_grupos}: {len(municipios)} municípios, ano {args.ano}")

    for codigo_ibge, nome in municipios.itertuples(index=False):
        focos_municipio = focos_todos_anos[focos_todos_anos["codigo_ibge"] == codigo_ibge]
        try:
            resultado = processar_municipio(codigo_ibge, nome, focos_municipio, args.ano)
        except Exception as e:
            print(f"[ERRO] {codigo_ibge} ({nome}): {type(e).__name__}: {e}")
            continue

        if resultado is None:
            continue

        with get_connection() as conn:
            _gravar_validacao(conn, codigo_ibge, args.ano, resultado)
        print(f"{codigo_ibge} ({nome}): {resultado['confiabilidade']} (IoU={resultado['interseccao_pct']}%, p={resultado['p_valor']})")


if __name__ == "__main__":
    main()
