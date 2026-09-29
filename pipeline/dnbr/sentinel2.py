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

from pipeline.dnbr.constants import COLECAO_L1C, COLECAO_SR, NO_DATA  # noqa: F401 (re-exportadas)

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
    area_exportacao: ee.Geometry,
    janela_antes: tuple[str, str],
    janela_depois: tuple[str, str],
    colecao: str = COLECAO_SR,
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
            ee.ImageCollection(colecao)
            .filterBounds(area_exportacao)
            .filterDate(*janela_antes)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", limite_nuvem))
        )
        colecao_depois = (
            ee.ImageCollection(colecao)
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


# Mosaico do estado (docs/DECISIONS.md seção 6.57). O `calcular_dnbr` acima,
# dos notebooks da pesquisa e usado nos números de cada município, filtra a
# CENA inteira pela nuvem e para no primeiro nível que cobre 50% da área:
# num município isso é quase sempre a área toda, mas no estado deixava até
# metade dele vazia (35 dos 104 meses com menos de 90% de cobertura), e a
# nuvem que sobrava dentro das cenas entrava na mediana como falso sinal de
# queima (nuvem derruba o NBR). Aqui a nuvem sai PIXEL a PIXEL, pela máscara
# Cloud Score+ do Google (a mesma pra L1C e SR), e todas as cenas do mês
# entram na mediana com os pixels limpos que tiverem. Só visualização: os
# números por município não passam por aqui.
COLECAO_CLOUD_SCORE = "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"
BANDA_CEU_LIMPO = "cs_cdf"
LIMIAR_CEU_LIMPO = 0.60  # valor recomendado na documentação do Cloud Score+
NUVEM_MAX_CENA_MOSAICO = 90  # só fica de fora a cena quase toda coberta


def _so_pixels_limpos(colecao: ee.ImageCollection) -> ee.ImageCollection:
    """Cada cena só com as bandas do NBR (B8, B12) e a máscara de céu limpo
    do Cloud Score+ (casada pelo system:index); cena sem máscara
    correspondente fica inteira de fora. Todas saem com as mesmas duas
    bandas — a mediana da coleção não aceita cenas com bandas diferentes."""
    cloud_score = ee.ImageCollection(COLECAO_CLOUD_SCORE)

    def mascarar(imagem):
        imagem = ee.Image(imagem)
        nbr = imagem.select(["B8", "B12"])
        return ee.Image(
            ee.Algorithms.If(
                imagem.bandNames().contains(BANDA_CEU_LIMPO),
                nbr.updateMask(imagem.select(BANDA_CEU_LIMPO).gte(LIMIAR_CEU_LIMPO)),
                nbr.updateMask(ee.Image.constant(0)),
            )
        )

    return colecao.linkCollection(cloud_score, [BANDA_CEU_LIMPO]).map(mascarar)


def calcular_dnbr_sem_nuvem(
    area_exportacao: ee.Geometry,
    janela_antes: tuple[str, str],
    janela_depois: tuple[str, str],
    colecao: str = COLECAO_SR,
) -> ResultadoDnbr:
    """dNBR = NBR(antes) - NBR(depois) sobre a mediana dos pixels LIMPOS de
    todas as cenas de cada janela. A cobertura devolvida é a fração real da
    área com pelo menos uma observação limpa nas duas janelas — o resto é
    nuvem o mês todo (ou falta de cena), e fica transparente."""

    def limpas(janela: tuple[str, str]) -> ee.ImageCollection:
        return _so_pixels_limpos(
            ee.ImageCollection(colecao)
            .filterBounds(area_exportacao)
            .filterDate(*janela)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", NUVEM_MAX_CENA_MOSAICO))
        )

    antes, depois = limpas(janela_antes), limpas(janela_depois)
    n_antes = antes.size().getInfo()
    n_depois = depois.size().getInfo()
    if n_antes == 0 or n_depois == 0:
        raise SemImagemValida(
            f"Nenhuma cena de {colecao} com menos de {NUVEM_MAX_CENA_MOSAICO}% de nuvem numa das janelas "
            f"({n_antes} antes, {n_depois} depois)."
        )
    nbr_antes = antes.median().normalizedDifference(["B8", "B12"]).rename("NBR_antes")
    nbr_depois = depois.median().normalizedDifference(["B8", "B12"]).rename("NBR_depois")
    dnbr = nbr_antes.subtract(nbr_depois).rename("dNBR").clip(area_exportacao).toFloat()
    cobertura_pct = _cobertura_valida_pct(dnbr.mask().rename("dNBR"), area_exportacao, scale=1000)
    return ResultadoDnbr(dnbr, n_antes, n_depois, NUVEM_MAX_CENA_MOSAICO, cobertura_pct)


def preparar_exportacao(dnbr: ee.Image, area_exportacao: ee.Geometry) -> tuple[ee.Image, ee.Image]:
    """(raster bruto com NO_DATA explicito, raster colorido pra visualizacao) —
    mesmo par que os notebooks exportam pro Drive (GEE_<Cidade>/dNBR_bruto_*
    e dNBR_colorido_*)."""
    bruto = dnbr.unmask(value=NO_DATA, sameFootprint=False).clip(area_exportacao).toFloat()
    colorido = dnbr.visualize(**VIS_PARAMS).clip(area_exportacao)
    return bruto, colorido
