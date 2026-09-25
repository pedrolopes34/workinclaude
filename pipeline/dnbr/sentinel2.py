"""Calculo do dNBR via Sentinel-2/Google Earth Engine — portado de
08_11Fase4_Rodada6_STDBSCAN_dNBR.ipynb (docs/DECISIONS.md secao 6.11), a
versao mais robusta confirmada (recorte pelo poligono municipal real, CRS
UTM dinamico, fallback de nuvem, checagem de cobertura real de pixels).

NAO EXECUTAVEL/TESTAVEL neste sandbox — GEE exige rede e credenciais que nao
estao disponiveis aqui (a service account key foi propositalmente roteada so
pro secret do GitHub Actions, nunca pra sessao do Claude Code). Validar
rodando de verdade em CI ou localmente com o Pedro antes de confiar no
resultado.
"""

from dataclasses import dataclass

import ee

from pipeline.dnbr.constants import NO_DATA

NIVEIS_NUVEM_FALLBACK = [20, 40, 60, 80]
COBERTURA_MINIMA_PCT = 50.0

VIS_PARAMS = {
    "min": 0.1,
    "max": 0.7,
    "palette": ["green", "yellow", "orange", "red", "black"],
}


class SemImagemValida(Exception):
    """Nenhuma cena Sentinel-2 na janela pedida ficou livre de nuvem o
    suficiente, OU a(s) cena(s) disponivel(is) cobrem pouco da area do
    municipio (cobertura de pixels validos abaixo do minimo aceitavel).
    Limitacao de disponibilidade de imagem de satelite pra aquela area/mes —
    sem relacao com o numero de focos de calor ou agrupamentos do ST-DBSCAN.
    """


@dataclass(frozen=True)
class ResultadoDnbr:
    imagem: ee.Image
    n_cenas_antes: int
    n_cenas_depois: int
    limite_nuvem_usado: int
    cobertura_pct: float


def _cobertura_valida_pct(imagem_binaria_valida: ee.Image, area: ee.Geometry, scale: int = 100) -> float:
    """% de pixels validos (mask=1) dentro da area — resolucao grosseira, so
    pra decidir rapido se a cena presta, nao e a escala de exportacao final."""
    stats = imagem_binaria_valida.reduceRegion(
        reducer=ee.Reducer.mean(), geometry=area, scale=scale, maxPixels=1e9, bestEffort=True
    ).getInfo()
    fracao = stats.get("dNBR")
    return 0.0 if fracao is None else float(fracao) * 100


def calcular_dnbr(
    area_exportacao: ee.Geometry, janela_antes: tuple[str, str], janela_depois: tuple[str, str]
) -> ResultadoDnbr:
    """dNBR = NBR(antes) - NBR(depois), NBR = normalizedDifference(B8, B12),
    sobre a mediana das cenas Sentinel-2 SR harmonizadas de cada janela.

    Tenta `NIVEIS_NUVEM_FALLBACK` em ordem crescente ate achar uma
    combinacao antes/depois cuja cobertura real de pixels validos dentro do
    municipio passe de `COBERTURA_MINIMA_PCT` — CLOUDY_PIXEL_PERCENTAGE
    filtra pela CENA inteira, nao pelo recorte, entao uma cena pode passar
    nesse filtro e ainda assim so tocar a borda do municipio (foi o caso de
    Registro, Vale do Ribeira — ver CONTEXTO_PROJETO.md).
    """
    for limite_nuvem in NIVEIS_NUVEM_FALLBACK:
        colecao_antes = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(area_exportacao)
            .filterDate(*janela_antes)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", limite_nuvem))
        )
        colecao_depois = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(area_exportacao)
            .filterDate(*janela_depois)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", limite_nuvem))
        )

        n_antes = colecao_antes.size().getInfo()
        n_depois = colecao_depois.size().getInfo()
        if n_antes == 0 or n_depois == 0:
            continue

        nbr_antes = colecao_antes.median().normalizedDifference(["B8", "B12"]).rename("NBR_antes")
        nbr_depois = colecao_depois.median().normalizedDifference(["B8", "B12"]).rename("NBR_depois")
        dnbr = nbr_antes.subtract(nbr_depois).rename("dNBR").clip(area_exportacao).toFloat()

        cobertura_pct = _cobertura_valida_pct(dnbr.mask().rename("dNBR"), area_exportacao)
        if cobertura_pct >= COBERTURA_MINIMA_PCT:
            return ResultadoDnbr(dnbr, n_antes, n_depois, limite_nuvem, cobertura_pct)

    raise SemImagemValida(
        f"Mesmo com nuvem<{NIVEIS_NUVEM_FALLBACK[-1]}%, nenhuma combinacao de imagens Sentinel-2 "
        f"cobriu pelo menos {COBERTURA_MINIMA_PCT:.0f}% da area do municipio."
    )


def preparar_exportacao(dnbr: ee.Image, area_exportacao: ee.Geometry) -> tuple[ee.Image, ee.Image]:
    """(raster bruto com NO_DATA explicito, raster colorido pra visualizacao) —
    mesmo par que os notebooks exportam pro Drive (GEE_<Cidade>/dNBR_bruto_*
    e dNBR_colorido_*)."""
    bruto = dnbr.unmask(value=NO_DATA, sameFootprint=False).clip(area_exportacao).toFloat()
    colorido = dnbr.visualize(**VIS_PARAMS).clip(area_exportacao)
    return bruto, colorido
