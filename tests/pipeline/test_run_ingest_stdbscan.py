from datetime import datetime

import pandas as pd
import pytest

from pipeline.run_ingest_stdbscan import calcular_teto_historico, processar_municipio


def _focos(ano: int, mes: int, n: int) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "ano": ano,
                "mes": mes,
                "latitude": -21.000 + 0.001 * i,
                "longitude": -48.220 + 0.001 * i,
                "data_hora": datetime(ano, mes, 1),
            }
            for i in range(n)
        ]
    )


def test_calcular_teto_historico_soma_o_ano_inteiro_e_ignora_ano_alvo():
    focos = pd.concat(
        [
            _focos(2018, 8, 5),
            _focos(2019, 6, 30),
            _focos(2019, 8, 25),  # 2019 = 30+25 = 55, teto real (ano inteiro, nao so agosto)
            _focos(2020, 8, 10),
            _focos(2024, 3, 999),  # ano alvo, nao conta pro historico mesmo fora de agosto
        ],
        ignore_index=True,
    )
    assert calcular_teto_historico(focos, ano_alvo=2024) == 55


def test_calcular_teto_historico_sem_dados_anteriores_e_zero():
    focos = _focos(2024, 8, 10)
    assert calcular_teto_historico(focos, ano_alvo=2024) == 0


def test_processar_municipio_soma_focos_do_ano_inteiro_nao_so_um_mes():
    # docs/DECISIONS.md secao 6.13: num_focos_calor e o total do ano, nao so agosto.
    focos = pd.concat([_focos(2024, 3, 10), _focos(2024, 8, 40), _focos(2024, 10, 5)], ignore_index=True)
    resultado = processar_municipio(focos, ano_alvo=2024)
    assert resultado["num_focos_calor"] == 55


def test_processar_municipio_promove_min_samples_quando_anomalo():
    # teto historico baixo (5), periodo atual bem acima (77 focos) -> anomalo, min_samples=4
    focos = pd.concat([_focos(2019, 8, 5), _focos(2024, 8, 77)], ignore_index=True)
    resultado = processar_municipio(focos, ano_alvo=2024)
    assert resultado["min_samples"] == 4
    assert resultado["num_focos_calor"] == 77
    assert resultado["eps_space_km"] == pytest.approx(3.0)
    assert resultado["eps_time_days"] == pytest.approx(1.0)


def test_processar_municipio_mantem_min_samples_baixo_quando_nao_anomalo():
    # 21 focos, mas teto historico de 55 (Morro Agudo, docs/DECISIONS.md secao 6.11)
    focos = pd.concat([_focos(2019, 8, 55), _focos(2024, 8, 21)], ignore_index=True)
    resultado = processar_municipio(focos, ano_alvo=2024)
    assert resultado["min_samples"] == 2


def test_processar_municipio_sem_focos_no_ano_zera_metricas():
    focos = _focos(2019, 8, 10)
    resultado = processar_municipio(focos, ano_alvo=2024)
    assert resultado["num_focos_calor"] == 0
    assert resultado["num_agrupamentos"] == 0
    assert resultado["area_st_dbscan_km2"] == 0.0
