from datetime import datetime, timedelta

import pandas as pd
import pytest

from pipeline.stdbscan.core import ParametrosStDbscan, poligono_stdbscan_municipio, resumir_eventos, rodar_stdbscan


def _foco(lat: float, lon: float, dias_offset: int) -> dict:
    return {
        "latitude": lat,
        "longitude": lon,
        "data_hora": datetime(2024, 8, 1) + timedelta(days=dias_offset),
    }


def test_forma_cluster_denso_e_isola_ruido_espacial():
    focos = pd.DataFrame(
        [
            _foco(-21.000, -48.220, 0),
            _foco(-21.001, -48.221, 0),
            _foco(-21.002, -48.219, 1),
            _foco(-21.001, -48.220, 0),
            _foco(-21.500, -48.900, 0),  # a dezenas de km, fica de fora
        ]
    )

    resultado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))

    cluster_denso = resultado.loc[0, "cluster"]
    assert cluster_denso != -1
    assert (resultado.loc[[1, 2, 3], "cluster"] == cluster_denso).all()
    assert resultado.loc[4, "cluster"] == -1


def test_separacao_temporal_impede_fusao_de_cluster():
    # Mesmo local, mas dois grupos de 4 focos no mesmo dia cada, com 30 dias
    # de intervalo entre os grupos — bem alem do eps_time_days=1.0.
    focos = pd.DataFrame(
        [_foco(-21.000, -48.220, 0) for _ in range(4)]
        + [_foco(-21.000, -48.220, 30) for _ in range(4)]
    )

    resultado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))

    grupo_inicial = set(resultado.loc[0:3, "cluster"])
    grupo_tardio = set(resultado.loc[4:7, "cluster"])
    assert -1 not in grupo_inicial
    assert -1 not in grupo_tardio
    assert grupo_inicial.isdisjoint(grupo_tardio)


def test_menos_focos_que_min_samples_vira_tudo_ruido():
    focos = pd.DataFrame([_foco(-21.000, -48.220, 0) for _ in range(3)])
    resultado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))
    assert (resultado["cluster"] == -1).all()


def test_dataframe_vazio_nao_quebra():
    focos = pd.DataFrame(columns=["latitude", "longitude", "data_hora"])
    resultado = rodar_stdbscan(focos)
    assert resultado.empty
    assert "cluster" in resultado.columns


def test_resumir_eventos_ignora_ruido_e_calcula_area():
    focos = pd.DataFrame(
        [
            _foco(-21.000, -48.220, 0),
            _foco(-21.001, -48.221, 0),
            _foco(-21.002, -48.219, 1),
            _foco(-21.001, -48.220, 0),
        ]
    )
    clusterizado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))

    eventos = resumir_eventos(clusterizado)

    assert len(eventos) == 1
    assert eventos.loc[0, "n_focos"] == 4
    assert eventos.loc[0, "area_km2"] > 0


def test_poligono_stdbscan_municipio_soma_agrupamentos_espacialmente_separados():
    focos = pd.DataFrame(
        [
            _foco(-21.000, -48.220, 0),
            _foco(-21.001, -48.221, 0),
            _foco(-21.002, -48.219, 1),
            _foco(-21.001, -48.220, 0),
        ]
        # segundo agrupamento, longe no tempo E no espaço (>3km) — nao se funde com o primeiro
        + [_foco(-21.500, -48.900, 30 + i) for i in range(4)]
    )
    clusterizado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))
    assert clusterizado["cluster"].nunique() == 2  # confere que formou 2 agrupamentos distintos

    poligono, epsg = poligono_stdbscan_municipio(clusterizado)

    assert not poligono.is_empty
    assert epsg != 0
    area_eventos = resumir_eventos(clusterizado)["area_km2"].sum()
    # agrupamentos nao se sobrepoem espacialmente -> uniao total = soma das partes
    assert poligono.area / 1_000_000 == pytest.approx(area_eventos, rel=1e-6)


def test_poligono_stdbscan_municipio_deduplica_agrupamentos_no_mesmo_lugar():
    # dois agrupamentos no MESMO local, so em janelas de tempo diferentes —
    # os buffers se sobrepoem no espaco, entao a uniao tem que ser MENOR que
    # a soma ingenua das duas areas separadas (sem dupla contagem).
    focos = pd.DataFrame(
        [_foco(-21.000, -48.220, 0) for _ in range(4)] + [_foco(-21.000, -48.220, 30) for _ in range(4)]
    )
    clusterizado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))
    assert clusterizado["cluster"].nunique() == 2

    poligono, _ = poligono_stdbscan_municipio(clusterizado)
    soma_ingenua_km2 = resumir_eventos(clusterizado)["area_km2"].sum()

    assert poligono.area / 1_000_000 < soma_ingenua_km2


def test_poligono_stdbscan_municipio_vazio_sem_agrupamento():
    focos = pd.DataFrame([_foco(-21.000, -48.220, 0) for _ in range(3)])
    clusterizado = rodar_stdbscan(focos, ParametrosStDbscan(min_samples=4))
    poligono, epsg = poligono_stdbscan_municipio(clusterizado)
    assert poligono.is_empty
    assert epsg == 0
