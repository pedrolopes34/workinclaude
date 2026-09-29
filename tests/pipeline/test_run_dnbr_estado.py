import json
from datetime import date
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from pipeline.run_dnbr_estado import (
    CONTORNO_SP,
    chave_r2,
    dimensoes,
    ler_mes,
    limites_e_proporcao,
    meses_fechados_do_ano,
    png_para_webp,
    resumo_png,
    ultimo_mes_completo,
)

MAPA_SITE = Path(__file__).resolve().parents[2] / "webapp" / "public" / "mapa" / "sp.json"


def test_mosaico_cobre_o_mesmo_retangulo_e_proporcao_do_mapa_do_site():
    """A imagem só encaixa no desenho se for o mesmo retângulo do viewBox."""
    contorno = json.loads(CONTORNO_SP.read_text(encoding="utf-8"))
    mapa = json.loads(MAPA_SITE.read_text(encoding="utf-8"))
    limites, proporcao = limites_e_proporcao(contorno)
    assert limites == mapa["limites"]
    # O viewBox arredonda a altura (669,46 -> 669); o mosaico usa a exata.
    assert abs(1000 * proporcao - mapa["altura"]) < 1
    assert dimensoes(2400, proporcao) == (2400, round(2400 * proporcao))


def test_ultimo_mes_completo_vira_o_ano_em_janeiro():
    assert ultimo_mes_completo(date(2026, 9, 27)) == (2026, 8)
    assert ultimo_mes_completo(date(2027, 1, 1)) == (2026, 12)


def test_meses_fechados_do_ano_nao_inclui_o_mes_corrente_nem_antes_de_2018():
    assert meses_fechados_do_ano(2026, date(2026, 9, 27)) == [(2026, m) for m in range(1, 9)]
    assert meses_fechados_do_ano(2024, date(2026, 9, 27)) == [(2024, m) for m in range(1, 13)]
    assert meses_fechados_do_ano(2017, date(2026, 9, 27)) == []


def test_ler_mes_e_chave():
    assert ler_mes("2024-08") == (2024, 8)
    assert chave_r2(2024, 8) == "dnbr-estado/2024-08.webp"
    with pytest.raises(Exception):
        ler_mes("2024-13")


def test_png_para_webp_mantem_transparencia():
    imagem = Image.new("RGBA", (40, 20), (0, 0, 0, 0))
    for x in range(20):
        for y in range(20):
            imagem.putpixel((x, y), (0, 128, 0, 255))
    png = BytesIO()
    imagem.save(png, format="PNG")
    webp = Image.open(BytesIO(png_para_webp(png.getvalue())))
    assert webp.format == "WEBP" and webp.mode == "RGBA"
    assert webp.getpixel((30, 10))[3] == 0  # fora de SP continua transparente
    assert webp.getpixel((5, 10))[3] == 255


def test_resumo_png_conta_cores_e_desenha():
    imagem = Image.new("RGBA", (80, 40), (0, 0, 0, 0))
    for x in range(40):
        for y in range(40):
            imagem.putpixel((x, y), (0, 128, 0, 255) if x < 32 else (255, 0, 0, 255))
    png = BytesIO()
    imagem.save(png, format="PNG")
    percentuais, desenho = resumo_png(png.getvalue(), colunas=8)
    assert percentuais.startswith("verde 80.0%")
    assert "vermelho 20.0%" in percentuais and "com imagem 50.0% do retângulo" in percentuais
    assert desenho.splitlines()[0] == "...#    "


def test_ate_jan_2019_compara_sr_e_l1c_depois_so_sr():
    """Seção 6.57: SR ainda não cobria o Brasil inteiro antes de 2019 — nesses
    meses fica a coleção que cobrir mais do estado."""
    from pipeline.dnbr.constants import COLECAO_L1C, COLECAO_SR
    from pipeline.run_dnbr_estado import colecoes_para_o_mes

    assert colecoes_para_o_mes(2018, 6) == (COLECAO_SR, COLECAO_L1C)
    assert colecoes_para_o_mes(2019, 1) == (COLECAO_SR, COLECAO_L1C)
    assert colecoes_para_o_mes(2019, 2) == (COLECAO_SR,)
    assert colecoes_para_o_mes(2026, 8) == (COLECAO_SR,)
