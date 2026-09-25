from pathlib import Path

import pandas as pd

from pipeline.ingest.inpe import carregar_focos_sp, padronizar_nome


def test_padronizar_nome_remove_acento_e_normaliza_caixa():
    assert padronizar_nome("Pitangueiras") == "PITANGUEIRAS"
    assert padronizar_nome("São José do Rio Preto") == "SAO JOSE DO RIO PRETO"


def test_carregar_focos_sp_cruza_por_nome_e_filtra_estado(tmp_path: Path):
    csv_bruto = tmp_path / "focos_anual_br_2024.csv"
    csv_bruto.write_text(
        "lat,lon,data_pas,municipio,estado\n"
        "-21.00,-48.22,2024-08-05,Pitangueiras,São Paulo\n"
        "-23.10,-46.60,2024-08-06,Santana de Parnaíba,São Paulo\n"
        "-15.00,-47.00,2024-08-05,Pitangueiras,Distrito Federal\n"  # nome duplicado em outro estado
    )
    municipios_ibge = pd.DataFrame(
        {
            "codigo_ibge": ["3538709", "3547304"],
            "nome": ["Pitangueiras", "Santana de Parnaíba"],
        }
    )

    focos = carregar_focos_sp(csv_bruto, municipios_ibge)

    assert len(focos) == 2
    assert set(focos["codigo_ibge"]) == {"3538709", "3547304"}
    assert focos["latitude"].tolist() == [-21.00, -23.10]
    assert focos["periodo_seco"].all()
