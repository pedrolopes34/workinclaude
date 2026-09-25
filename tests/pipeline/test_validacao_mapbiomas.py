import pytest
from shapely.geometry import box

from pipeline.validacao.mapbiomas import calcular_iou_recall, classificar_confiabilidade, permutacao_iou


def test_calcular_iou_recall_sobreposicao_parcial_conhecida():
    # dois quadrados de 1 km2 cada, sobrepostos em 0,25 km2 (meio quadrado x meio quadrado)
    cluster = box(0, 0, 1000, 1000)
    mapbiomas = box(500, 500, 1500, 1500)

    resultado = calcular_iou_recall(cluster, mapbiomas)

    assert resultado.intersecao_km2 == pytest.approx(0.25)
    assert resultado.uniao_km2 == pytest.approx(1.75)
    assert resultado.iou == pytest.approx(0.25 / 1.75)
    assert resultado.recall_pct == pytest.approx(25.0)  # 0,25 de 1 km2 do mapbiomas


def test_calcular_iou_recall_geometria_vazia_nao_quebra():
    from shapely.geometry import GeometryCollection

    resultado = calcular_iou_recall(GeometryCollection(), box(0, 0, 100, 100))
    assert resultado.iou == 0.0
    assert resultado.recall_pct == 0.0


def test_calcular_iou_recall_sem_sobreposicao_e_zero():
    cluster = box(0, 0, 100, 100)
    mapbiomas = box(10_000, 10_000, 10_100, 10_100)
    resultado = calcular_iou_recall(cluster, mapbiomas)
    assert resultado.iou == 0.0
    assert resultado.recall_pct == 0.0


def test_teste_permutacao_significativo_quando_coincide_quase_perfeitamente():
    dominio = box(0, 0, 50_000, 50_000)  # municipio grande, 2500 km2
    mapbiomas = box(24_000, 24_000, 26_000, 26_000)  # 4 km2, bem no meio
    cluster = box(24_050, 24_050, 25_950, 25_950)  # quase o mesmo lugar/tamanho

    iou_obs, p_valor = permutacao_iou(cluster, mapbiomas, dominio, n_permutacoes=200, seed=42)

    assert iou_obs > 0.9
    assert p_valor < 0.05  # improvavel reposicionar aleatoriamente e cair quase no mesmo lugar


def test_teste_permutacao_nao_significativo_sem_sobreposicao_observada():
    dominio = box(0, 0, 50_000, 50_000)
    mapbiomas = box(1_000, 1_000, 1_100, 1_100)
    cluster = box(40_000, 40_000, 40_100, 40_100)  # longe, sem sobreposicao real

    iou_obs, p_valor = permutacao_iou(cluster, mapbiomas, dominio, n_permutacoes=200, seed=42)

    assert iou_obs == 0.0
    assert p_valor > 0.5


def test_teste_permutacao_geometria_vazia_devolve_p_valor_um():
    from shapely.geometry import GeometryCollection

    dominio = box(0, 0, 1000, 1000)
    iou_obs, p_valor = permutacao_iou(GeometryCollection(), box(0, 0, 10, 10), dominio)
    assert iou_obs == 0.0
    assert p_valor == 1.0


# Exemplos documentados em docs/DECISIONS.md secao 1.3 — conferidos na Tabela Final.
def test_classificar_confiabilidade_alta_ibitinga():
    assert classificar_confiabilidade(n_agrupamentos=2, recall_pct=83.2, p_valor=0.003) == "Alta"


def test_classificar_confiabilidade_media_pitangueiras_recall_alto_p_alto():
    assert classificar_confiabilidade(n_agrupamentos=7, recall_pct=93.8, p_valor=0.223) == "Média"


def test_classificar_confiabilidade_media_altinopolis_p_baixo_recall_baixo():
    assert classificar_confiabilidade(n_agrupamentos=1, recall_pct=12.3, p_valor=0.045) == "Média"


def test_classificar_confiabilidade_baixa_araraquara():
    assert classificar_confiabilidade(n_agrupamentos=2, recall_pct=8.5, p_valor=0.086) == "Baixa"


def test_classificar_confiabilidade_insuficiente_guarulhos_sem_cluster():
    assert classificar_confiabilidade(n_agrupamentos=0, recall_pct=None, p_valor=None) == "Insuficiente"
