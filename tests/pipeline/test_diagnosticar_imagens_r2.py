import pytest

from pipeline.diagnosticar_imagens_r2 import categoria_host, chave_do_objeto


@pytest.mark.parametrize(
    "url",
    [
        # base certa (URL pública de desenvolvimento do R2)
        "https://pub-59753fc04edb4e0c8cfbfed2449caf53.r2.dev/dnbr/3500105-2026-09.png",
        # endpoint S3 com o bucket no caminho — hipótese mais provável da base
        # errada original (docs/DECISIONS.md seção 6.49)
        "https://a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4.r2.cloudflarestorage.com/queimadas-sp-dnbr/dnbr/3500105-2026-09.png",
        # base qualquer com barra dupla acidental
        "https://exemplo.com//dnbr/3500105-2026-09.png",
    ],
)
def test_chave_do_objeto_independe_da_base(url):
    assert chave_do_objeto(url) == "dnbr/3500105-2026-09.png"


def test_chave_do_objeto_usa_a_ultima_ocorrencia_de_dnbr():
    # se a própria base tiver "/dnbr/" no caminho, a chave é só a parte final
    url = "https://exemplo.com/dnbr/espelho/dnbr/3533908-2026-09.png"
    assert chave_do_objeto(url) == "dnbr/3533908-2026-09.png"


def test_chave_do_objeto_sem_dnbr_devolve_none():
    assert chave_do_objeto("/dnbr-pitangueiras.png") is None
    assert chave_do_objeto("https://exemplo.com/outra/coisa.png") is None


@pytest.mark.parametrize(
    "url,esperado",
    [
        ("https://pub-abc.r2.dev/dnbr/x.png", "r2.dev (URL pública)"),
        ("https://abc.r2.cloudflarestorage.com/b/dnbr/x.png", "r2.cloudflarestorage.com (endpoint S3 — privado, exige assinatura)"),
        ("https://imagens.exemplo.com/dnbr/x.png", "outro (imagens.exemplo.com)"),
    ],
)
def test_categoria_host(url, esperado):
    assert categoria_host(url) == esperado
