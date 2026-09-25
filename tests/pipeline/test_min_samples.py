"""Regressao da formula de min_samples contra os 12 casos reais em que a
pesquisa original variou o parametro manualmente (grupo_complemento,
docs/DECISIONS.md secao 6.11). Qualquer mudanca na formula que quebre um
desses casos precisa de nova validacao explicita do Pedro, nao so passar
nos testes.
"""

import pytest

from pipeline.stdbscan.core import calcular_min_samples

CASOS_REAIS = [
    ("Ibitinga", 77, 5, 4),
    ("Pontal", 53, 19, 4),
    ("Barrinha", 40, 1, 4),
    ("Areiopolis", 34, 4, 4),
    ("Jau", 25, 14, 4),
    ("Rio_Claro", 20, 10, 4),
    ("Morro_Agudo", 21, 55, 2),
    ("Viradouro", 1, 4, 2),
    ("Terra_Roxa", 0, 0, 2),
    ("Tupa", 0, 0, 2),
    ("Barra_do_Chapeu", 0, 0, 2),
    ("Iporanga", 0, 0, 2),
]


@pytest.mark.parametrize(
    "municipio,focos_periodo_atual,teto_historico,esperado", CASOS_REAIS
)
def test_reproduz_decisao_original(municipio, focos_periodo_atual, teto_historico, esperado):
    assert calcular_min_samples(focos_periodo_atual, teto_historico) == esperado, municipio


def test_limiar_minimo_e_configuravel():
    assert calcular_min_samples(3, teto_historico=0, limiar_minimo=4) == 2
    assert calcular_min_samples(3, teto_historico=0, limiar_minimo=3) == 4
