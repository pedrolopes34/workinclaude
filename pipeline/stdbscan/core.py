"""ST-DBSCAN oficial do projeto — portado de 06_11_Aplicacao_ST-DBSCAN_Geral18-24_Pitangueiras
(ver docs/DECISIONS.md secao 6.11 para a proveniencia e a formula exata).

Parametros oficiais: eps_space_km=3.0, eps_time_days=1.0. min_samples varia
por rodada (ver calcular_min_samples) — nunca e mais uma constante global.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from shapely.geometry.base import BaseGeometry
from shapely.geometry import GeometryCollection
from sklearn.cluster import DBSCAN
from sklearn.metrics import pairwise_distances

from pipeline.common.geo import projetar_para_utm_km, unir_buffers

EPS_SPACE_KM = 3.0
EPS_TIME_DAYS = 1.0


@dataclass(frozen=True)
class ParametrosStDbscan:
    eps_space_km: float = EPS_SPACE_KM
    eps_time_days: float = EPS_TIME_DAYS
    min_samples: int = 4


def calcular_min_samples(
    focos_periodo_atual: int, teto_historico: int, limiar_minimo: int = 4
) -> int:
    """min_samples=4 so quando o periodo tem sinal anomalo (acima do proprio
    teto historico do municipio) E pelo menos `limiar_minimo` focos; caso
    contrario, 2 — formula calibrada e validada contra os 12 casos reais de
    `min_samples` variavel da pesquisa (docs/DECISIONS.md secao 6.11).
    """
    anomalo = focos_periodo_atual > teto_historico
    if focos_periodo_atual >= limiar_minimo and anomalo:
        return 4
    return 2


def rodar_stdbscan(
    focos: pd.DataFrame, parametros: ParametrosStDbscan = ParametrosStDbscan()
) -> pd.DataFrame:
    """Recebe focos de um unico municipio/periodo (colunas obrigatorias:
    latitude, longitude, data_hora) e devolve o mesmo DataFrame com a coluna
    `cluster` (-1 = ruido, >=0 = id do agrupamento espaco-temporal).
    """
    if focos.empty:
        return focos.assign(cluster=pd.Series(dtype=int))

    if len(focos) < parametros.min_samples:
        return focos.assign(cluster=-1)

    focos, _ = projetar_para_utm_km(focos)
    t0 = focos["data_hora"].min()
    focos["t_dias"] = (focos["data_hora"] - t0).dt.total_seconds() / 86400

    dist_espacial = pairwise_distances(focos[["x_km", "y_km"]].to_numpy(), metric="euclidean")
    dist_temporal = pairwise_distances(focos[["t_dias"]].to_numpy(), metric="manhattan")
    dist_combinada = np.maximum(
        dist_espacial / parametros.eps_space_km,
        dist_temporal / parametros.eps_time_days,
    )

    modelo = DBSCAN(eps=1.0, min_samples=parametros.min_samples, metric="precomputed")
    focos["cluster"] = modelo.fit_predict(dist_combinada)
    return focos.drop(columns=["t_dias"])


def resumir_eventos(
    focos_clusterizados: pd.DataFrame, eps_space_km: float = EPS_SPACE_KM
) -> pd.DataFrame:
    """Um evento por cluster (ignora ruido): contagem, janela temporal e area
    de influencia em km2 (buffer de eps_space_km por foco, unido — mesmo
    metodo de 08_00Analise_Imagens_IdPadroes_CORRIGIDO.ipynb)."""
    agrupados = focos_clusterizados[focos_clusterizados["cluster"] != -1]
    if agrupados.empty:
        return pd.DataFrame(
            columns=["cluster", "n_focos", "data_inicio", "data_fim", "area_km2"]
        )

    focos_metros, _ = projetar_para_utm_km(agrupados)
    raio_m = eps_space_km * 1000

    linhas = []
    for cluster_id, grupo in focos_metros.groupby("cluster"):
        area_poligono = unir_buffers(grupo["x_km"], grupo["y_km"], raio_m)
        linhas.append(
            {
                "cluster": int(cluster_id),
                "n_focos": len(grupo),
                "data_inicio": grupo["data_hora"].min(),
                "data_fim": grupo["data_hora"].max(),
                "area_km2": area_poligono.area / 1_000_000,
            }
        )
    return pd.DataFrame(linhas)


def poligono_stdbscan_municipio(
    focos_clusterizados: pd.DataFrame, eps_space_km: float = EPS_SPACE_KM
) -> tuple[BaseGeometry, int]:
    """Poligono unico = uniao de TODOS os agrupamentos do municipio (nao um
    por cluster, como resumir_eventos) — e o que a comparacao com o
    MapBiomas usa (docs/DECISIONS.md secao 6.15), que e por municipio/ano,
    nao por evento. Devolve (poligono, epsg_metrico); poligono vazio e
    epsg=0 se nao houve nenhum agrupamento."""
    agrupados = focos_clusterizados[focos_clusterizados["cluster"] != -1]
    if agrupados.empty:
        return GeometryCollection(), 0

    focos_metros, epsg_metrico = projetar_para_utm_km(agrupados)
    raio_m = eps_space_km * 1000
    return unir_buffers(focos_metros["x_km"], focos_metros["y_km"], raio_m), epsg_metrico
