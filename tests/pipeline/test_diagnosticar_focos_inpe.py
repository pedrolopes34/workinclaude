from pathlib import Path

import pandas as pd

from shapely.geometry import box

from pipeline.diagnosticar_focos_inpe import (
    _escapar,
    amostra_da_pesquisa,
    areas_dos_agrupamentos,
    focos_do_recorte_com_satelite,
    numeros_da_pesquisa,
    resumo_satelite_por_mes,
)
from pipeline.ingest.inpe import carregar_focos_sp


def test_recorte_com_satelite_bate_com_o_recorte_da_consulta(tmp_path: Path):
    csv_bruto = tmp_path / "focos_anual_br_2024.csv"
    csv_bruto.write_text(
        "lat,lon,data_hora_gmt,municipio,estado,satelite\n"
        "-21.00,-48.22,2024-08-05 16:00:00,Pitangueiras,São Paulo,AQUA_M-T\n"
        "-21.01,-48.21,2024-08-05 16:10:00,PITANGUEIRAS,São Paulo,GOES-16\n"
        "-21.02,-48.20,2024-07-30 15:00:00,Pitangueiras,São Paulo,AQUA_M-T\n"  # outro mês
        "-15.00,-47.00,2024-08-05 16:00:00,Pitangueiras,Distrito Federal,AQUA_M-T\n"  # outro estado
        "-23.10,-46.60,2024-08-06 16:00:00,Santana de Parnaíba,São Paulo,NPP-375\n"  # outro município
    )
    municipio_df = pd.DataFrame({"codigo_ibge": ["3539509"], "nome": ["Pitangueiras"]})

    focos = focos_do_recorte_com_satelite(csv_bruto, municipio_df, mes=8)

    todos = carregar_focos_sp(csv_bruto, municipio_df, satelite=None)
    assert len(focos) == int((todos["mes"] == 8).sum()) == 2
    so_referencia = carregar_focos_sp(csv_bruto, municipio_df)
    assert int((so_referencia["mes"] == 8).sum()) == 1
    assert sorted(focos["satelite"]) == ["AQUA_M-T", "GOES-16"]
    assert {"latitude", "longitude", "data_hora"} <= set(focos.columns)


def test_numeros_da_pesquisa_so_existem_pra_amostra_em_ago_2024():
    assert numeros_da_pesquisa("Pitangueiras", 2024, 8) == {
        "n_focos": 95,
        "n_agrupamentos": 7,
        "area_st_dbscan_km2": 432.9,
    }
    assert numeros_da_pesquisa("Pitangueiras", 2024, 7) is None
    assert numeros_da_pesquisa("Município Que Não Existe", 2024, 8) is None


def test_amostra_da_pesquisa_le_focos_agrupamentos_e_area():
    texto = (
        "    ('3539509', 2024, 95, 7, 432.9, 583.97),\n"
        "    ('3502705', 2024, 2, 0, NULL, 194.35),\n"
    )
    assert amostra_da_pesquisa(texto) == {"3539509": (95, 7, 432.9), "3502705": (2, 0, None)}


def test_area_recortada_nunca_passa_da_area_sem_recorte():
    # 5 focos no mesmo dia, ~1 km entre si, no canto de um "município"
    # quadrado de ~11 km de lado: parte do raio de 3 km cai fora dele.
    focos = pd.DataFrame(
        {
            "latitude": [-21.00, -21.005, -21.01, -21.005, -21.00],
            "longitude": [-48.20, -48.205, -48.20, -48.195, -48.21],
            "data_hora": pd.to_datetime(["2024-08-05 16:00"] * 5),
        }
    )
    municipio = box(-48.20, -21.10, -48.10, -21.00)
    n, area, recortada = areas_dos_agrupamentos(focos, 4, municipio)
    assert n == 1
    assert 0 < recortada < area


def test_resumo_satelite_por_mes_conta_referencia_sobre_total():
    focos = pd.DataFrame(
        {
            "data_hora": pd.to_datetime(["2025-01-03", "2025-01-09", "2025-02-01"]),
            "satelite": ["AQUA_M-T", "NOAA-20", "NOAA-20"],
        }
    )
    assert resumo_satelite_por_mes(focos) == "01: 1 de 2 | 02: 0 de 1"


def test_escapar_segue_o_formato_de_comando_do_actions():
    assert _escapar("Amostra: agr, área", True) == "Amostra%3A agr%2C área"
    assert _escapar("até 10% | a: b", False) == "até 10%25 | a: b"
