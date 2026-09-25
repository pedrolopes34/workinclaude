from datetime import date

import pandas as pd
import pytest

from pipeline.run_dnbr import dividir_em_grupo, janela_mes_anterior


@pytest.mark.parametrize(
    "hoje,esperado_antes,esperado_depois",
    [
        (date(2024, 9, 15), ("2024-08-01", "2024-09-01"), ("2024-09-01", "2024-09-15")),
        (date(2024, 1, 10), ("2023-12-01", "2024-01-01"), ("2024-01-01", "2024-01-10")),  # virada de ano
        (date(2024, 3, 1), ("2024-02-01", "2024-03-01"), ("2024-03-01", "2024-03-01")),  # fevereiro bissexto
    ],
)
def test_janela_mes_anterior(hoje, esperado_antes, esperado_depois):
    antes, depois = janela_mes_anterior(hoje)
    assert antes == esperado_antes
    assert depois == esperado_depois


def test_dividir_em_grupo_particiona_sem_sobreposicao():
    municipios = pd.DataFrame({"codigo_ibge": [f"{i:07d}" for i in range(7)], "nome": [f"M{i}" for i in range(7)]})

    grupo1 = dividir_em_grupo(municipios, grupo=1, de_grupos=2)
    grupo2 = dividir_em_grupo(municipios, grupo=2, de_grupos=2)

    assert set(grupo1["codigo_ibge"]) | set(grupo2["codigo_ibge"]) == set(municipios["codigo_ibge"])
    assert set(grupo1["codigo_ibge"]).isdisjoint(set(grupo2["codigo_ibge"]))
    assert abs(len(grupo1) - len(grupo2)) <= 1


def test_dividir_em_grupo_rejeita_indice_fora_do_intervalo():
    municipios = pd.DataFrame({"codigo_ibge": ["1"], "nome": ["M"]})
    with pytest.raises(ValueError):
        dividir_em_grupo(municipios, grupo=0, de_grupos=2)
    with pytest.raises(ValueError):
        dividir_em_grupo(municipios, grupo=3, de_grupos=2)
