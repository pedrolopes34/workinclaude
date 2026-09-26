"""Busca a área queimada do MapBiomas Fogo (Earth Engine) pra um
município/ano — a "outra fonte independente" contra a qual o ST-DBSCAN é
comparado (docs/DECISIONS.md seção 6.15).

NÃO CONFIRMADO contra a fonte primária (brasil.mapbiomas.org bloqueado pro
fetch direto neste sandbox, mesmo padrão da seção 6.9/6.12) — mas revisado
em 26/09/2026 com evidência bem mais forte que a 1ª tentativa (ver
docs/DECISIONS.md seção 6.21). A suposição anterior usava o asset
"monthly" (mensal) como se fosse uma `ee.Image` de 40 bandas por ÍNDICE —
inconsistente: "mensal" e "1 banda por ano" são propriedades
contraditórias, e buscas indicam que o produto mensal na verdade é uma
`ee.ImageCollection`, não uma `ee.Image`. Como a pergunta que este módulo
faz é "queimou em algum mês do `ano`" — uma agregação ANUAL — o asset certo
é o "annual_burned_coverage" (Coleção 4), que É uma `ee.Image` multi-banda
como o código já esperava, com bandas NOMEADAS `burned_coverage_{ano}`
(confirmado por busca, não por acesso direto) — trocado de seleção por
índice pra seleção por nome, mais robusto a qualquer reordenação de banda.
Pixel = código de classe de uso/cobertura (MapBiomas Coleção 8) que
queimou naquele ano; 0 = não queimou — "pixel > 0 = queimou" continua
válido nessa leitura.
"""

ASSET_MAPBIOMAS_FOGO_ANUAL = (
    "projects/mapbiomas-public/assets/brazil/fire/collection4/mapbiomas_fire_collection4_annual_burned_coverage_v1"
)


def buscar_area_queimada(area_ee, ano: int, epsg_metrico: int, scale: int = 30, debug: bool = False):
    """Poligono (shapely, na projecao epsg_metrico) da area que o MapBiomas
    Fogo classificou como queimada em algum mes do `ano`, dentro de
    `area_ee` (ee.Geometry do municipio). Poligono vazio se nao houver
    nenhum pixel queimado.

    `debug=True` (docs/DECISIONS.md secao 6.28/6.30) imprime quantas feicoes
    o reduceToVectors devolveu — e exatamente o numero que fica sempre 0 no
    bug em aberto, entao e o sinal mais direto pra confirmar se um fix
    funcionou sem esperar o pipeline inteiro."""
    import ee
    from shapely.geometry import shape
    from shapely.ops import unary_union

    colecao = ee.Image(ASSET_MAPBIOMAS_FOGO_ANUAL)
    banda_ano = colecao.select(f"burned_coverage_{ano}")
    queimado = banda_ano.gt(0).selfMask()

    vetorizado = queimado.reduceToVectors(
        geometry=area_ee,
        scale=scale,
        geometryType="polygon",
        eightConnected=True,
        maxPixels=1e10,
        crs=f"EPSG:{epsg_metrico}",
    )

    features = vetorizado.getInfo()["features"]
    if debug:
        print(f"[DEBUG] reduceToVectors: {len(features)} feições")
    if not features:
        from shapely.geometry import GeometryCollection

        return GeometryCollection()

    geometrias = [shape(f["geometry"]) for f in features]
    return unary_union(geometrias)
