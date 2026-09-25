"""Utilitarios geoespaciais compartilhados entre stdbscan/ e dnbr/."""

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union


def epsg_utm_sirgas2000(longitude_graus: float) -> int:
    """EPSG do fuso UTM SIRGAS2000 (hemisferio sul) que contem a longitude dada.

    SP cobre os fusos 22S e 23S (raramente 21S/24S nas bordas do estado) —
    por isso o fuso e calculado por cidade, nunca fixo (ver docs/DECISIONS.md
    secao 6.11: o notebook 06_09 fixava EPSG:31983 pra qualquer cidade e
    errava o fuso de Pitangueiras, que e 22S/31982; 06_11 corrige isso
    calculando dinamicamente, replicado aqui).
    """
    zona = int((longitude_graus + 180) // 6) + 1
    return 31960 + zona


def unir_buffers(x_km: pd.Series, y_km: pd.Series, raio_m: float) -> BaseGeometry:
    """Poligono unico = uniao dos buffers circulares de raio `raio_m` (metros)
    em torno de cada ponto (coordenadas metricas, em km). Usado tanto pra
    area de influencia do agrupamento ST-DBSCAN (raio=eps_space_km, ver
    stdbscan/core.py) quanto pra zona de validacao do dNBR por evento
    (raio=500m, ver dnbr/validacao.py) — mesma operacao, raios diferentes,
    confirmados em notebooks distintos (docs/DECISIONS.md secao 6.11)."""
    pontos = (Point(x * 1000, y * 1000) for x, y in zip(x_km, y_km))
    return unary_union([p.buffer(raio_m) for p in pontos])


def projetar_para_utm_km(focos: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Adiciona x_km/y_km (projecao metrica UTM SIRGAS2000, fuso pela
    longitude media do lote) a um DataFrame com colunas latitude/longitude.
    Fonte em EPSG:4326 (WGS84) — datum de origem dos focos do INPE
    (docs/DECISIONS.md secao 6.11); diferenca pratica pro SIRGAS2000 e
    centimetrica, irrelevante pro limiar de 3 km do ST-DBSCAN."""
    lon_media = focos["longitude"].mean()
    epsg_metrico = epsg_utm_sirgas2000(lon_media)

    gdf_graus = gpd.GeoDataFrame(
        focos,
        geometry=gpd.points_from_xy(focos["longitude"], focos["latitude"]),
        crs="EPSG:4326",
    )
    gdf_metrico = gdf_graus.to_crs(epsg_metrico)

    focos = focos.copy()
    focos["x_km"] = gdf_metrico.geometry.x / 1000
    focos["y_km"] = gdf_metrico.geometry.y / 1000
    return focos, epsg_metrico
