from pathlib import Path

import pandas as pd

from pipeline.diagnosticar_focos_inpe import focos_do_recorte_com_satelite, numeros_da_pesquisa
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

    consulta = carregar_focos_sp(csv_bruto, municipio_df)
    assert len(focos) == int((consulta["mes"] == 8).sum()) == 2
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
