from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import rasterio
from rasterio.transform import from_origin

from pipeline.common.geo import projetar_para_utm_km
from pipeline.dnbr.validacao import classificar_severidade, estatisticas_por_evento


@pytest.mark.parametrize(
    "dnbr,esperado",
    [
        (0.05, "sem_evidencia_clara"),
        (0.09999, "sem_evidencia_clara"),
        (0.10, "fraca"),
        (0.20, "fraca"),
        (0.27, "moderada"),
        (0.40, "moderada"),
        (0.44, "forte"),
        (0.90, "forte"),
    ],
)
def test_classificar_severidade_nos_limiares_confirmados(dnbr, esperado):
    assert classificar_severidade(dnbr) == esperado


def _raster_constante(caminho: Path, x_centro_m: float, y_centro_m: float, epsg: int, valor: float) -> None:
    tamanho_px = 200
    resolucao_m = 10
    origem_x = x_centro_m - (tamanho_px * resolucao_m) / 2
    origem_y = y_centro_m + (tamanho_px * resolucao_m) / 2

    dados = np.full((tamanho_px, tamanho_px), valor, dtype="float32")
    transform = from_origin(origem_x, origem_y, resolucao_m, resolucao_m)

    with rasterio.open(
        caminho,
        "w",
        driver="GTiff",
        height=tamanho_px,
        width=tamanho_px,
        count=1,
        dtype="float32",
        crs=f"EPSG:{epsg}",
        transform=transform,
    ) as dst:
        dst.write(dados, 1)


def test_estatisticas_por_evento_le_raster_e_classifica_severidade(tmp_path: Path):
    focos_clusterizados = pd.DataFrame(
        [
            {"latitude": -21.000, "longitude": -48.220, "data_hora": datetime(2024, 8, 1), "cluster": 0},
            {"latitude": -21.001, "longitude": -48.221, "data_hora": datetime(2024, 8, 1), "cluster": 0},
            {"latitude": -21.500, "longitude": -48.900, "data_hora": datetime(2024, 8, 1), "cluster": -1},
        ]
    )

    focos_metros, epsg_metrico = projetar_para_utm_km(focos_clusterizados[focos_clusterizados["cluster"] == 0])
    x_centro_m = focos_metros["x_km"].mean() * 1000
    y_centro_m = focos_metros["y_km"].mean() * 1000

    caminho_raster = tmp_path / "dnbr.tif"
    _raster_constante(caminho_raster, x_centro_m, y_centro_m, epsg_metrico, valor=0.35)

    resultado = estatisticas_por_evento(str(caminho_raster), focos_clusterizados)

    assert len(resultado) == 1  # ruido (cluster -1) fica de fora
    assert resultado.loc[0, "dnbr_medio"] == pytest.approx(0.35, abs=1e-3)
    assert resultado.loc[0, "severidade"] == "moderada"
