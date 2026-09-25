"""Classificacao de evidencia espectral e estatistica do dNBR por evento
ST-DBSCAN — portado de 06_11 (celula de validacao) e 08_07dNBR_testesgerais
(docs/DECISIONS.md secao 6.11).

`estatisticas_por_evento` e testada com um GeoTIFF sintetico (nao depende de
GEE) em tests/pipeline/test_dnbr_validacao.py — so o restante de dnbr/
(calculo do dNBR em si) precisa de rede/credenciais do Earth Engine.
"""

import pandas as pd
import rasterio
from pyproj import Transformer
from rasterstats import zonal_stats
from shapely.ops import transform

from pipeline.common.geo import projetar_para_utm_km, unir_buffers
from pipeline.dnbr.constants import BUFFER_VALIDACAO_M, LIMIARES_SEVERIDADE, NO_DATA


def classificar_severidade(dnbr_medio: float) -> str:
    """4 faixas confirmadas em 08_07dNBR_testesgerais.ipynb — usadas tanto
    pra classificar pixel a pixel quanto pra classificar o dNBR medio de um
    evento ST-DBSCAN inteiro."""
    baixo, medio, alto = LIMIARES_SEVERIDADE
    if dnbr_medio < baixo:
        return "sem_evidencia_clara"
    if dnbr_medio < medio:
        return "fraca"
    if dnbr_medio < alto:
        return "moderada"
    return "forte"


def estatisticas_por_evento(
    caminho_raster_dnbr: str, focos_clusterizados: pd.DataFrame, buffer_m: int = BUFFER_VALIDACAO_M
) -> pd.DataFrame:
    """Uma linha por evento (cluster != -1): buffer de `buffer_m` em torno dos
    focos do evento, unidos, com media/mediana/min/max/desvio do dNBR dentro
    dessa zona + severidade classificada pela media."""
    agrupados = focos_clusterizados[focos_clusterizados["cluster"] != -1]
    if agrupados.empty:
        return pd.DataFrame(
            columns=["cluster", "dnbr_medio", "dnbr_mediana", "dnbr_min", "dnbr_max", "dnbr_desvio", "severidade"]
        )

    focos_metros, epsg_metrico = projetar_para_utm_km(agrupados)

    with rasterio.open(caminho_raster_dnbr) as raster:
        epsg_raster = raster.crs.to_epsg()
    reprojetar = (
        Transformer.from_crs(epsg_metrico, epsg_raster, always_xy=True).transform
        if epsg_raster != epsg_metrico
        else None
    )

    linhas = []
    for cluster_id, grupo in focos_metros.groupby("cluster"):
        zona = unir_buffers(grupo["x_km"], grupo["y_km"], buffer_m)
        if reprojetar is not None:
            zona = transform(reprojetar, zona)
        stats = zonal_stats(
            [zona],
            caminho_raster_dnbr,
            stats=["mean", "median", "min", "max", "std"],
            nodata=NO_DATA,
            geojson_out=False,
        )[0]
        linhas.append(
            {
                "cluster": int(cluster_id),
                "dnbr_medio": stats["mean"],
                "dnbr_mediana": stats["median"],
                "dnbr_min": stats["min"],
                "dnbr_max": stats["max"],
                "dnbr_desvio": stats["std"],
                "severidade": classificar_severidade(stats["mean"]) if stats["mean"] is not None else "sem_dados",
            }
        )
    return pd.DataFrame(linhas)
