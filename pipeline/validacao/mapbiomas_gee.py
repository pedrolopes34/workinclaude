"""Busca a área queimada do MapBiomas Fogo (Earth Engine) pra um
município/ano — a "outra fonte independente" contra a qual o ST-DBSCAN é
comparado (docs/DECISIONS.md seção 6.15).

Asset confirmado por execução real (docs/DECISIONS.md seção 6.21/6.22):
"annual_burned_coverage" (Coleção 4), `ee.Image` multi-banda com bandas
NOMEADAS `burned_coverage_{ano}` (1985-2024). Pixel = código de classe de
uso/cobertura (MapBiomas Coleção 8) que queimou naquele ano; 0 = não
queimou — "pixel > 0 = queimou".

Bug de projeção corrigido por execução real com `--municipio`
(docs/DECISIONS.md seção 6.31): `reduceToVectors` sempre funcionou (nunca
foi bug de geometria de entrada nem de complexidade de polígono, ao
contrário do que as seções 6.24/6.25/6.28 supunham) — o problema era que
`getInfo()` numa `FeatureCollection` do Earth Engine sempre devolve
geometria em EPSG:4326, independente do `crs` pedido no `reduceToVectors`
(que só afeta a grade de cálculo interna). As feições vinham corretas, só
que em graus, e eram tratadas como se já estivessem em `epsg_metrico`
(metros) — por isso a área saía ~0 e o IoU contra `cluster_geom` nunca
podia ter overlap. Reprojeta explicitamente EPSG:4326 → `epsg_metrico`
antes de qualquer cálculo de área/interseção.
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
    o reduceToVectors devolveu.

    CAUSA RAIZ REAL do bug "sempre Baixa/IoU=0%/p=1.0" (docs/DECISIONS.md
    secao 6.31, confirmada por execucao real com --municipio): nunca foi a
    geometria de entrada nem o reduceToVectors em si — os dois sempre
    funcionaram (117 feicoes reais devolvidas pra Ibitinga, mesma ordem de
    grandeza do teste ao vivo no Code Editor). O bug e que `getInfo()` numa
    FeatureCollection do Earth Engine sempre serializa a geometria em
    EPSG:4326 (convencao GeoJSON/RFC 7946), **independente** do `crs` pedido
    no `reduceToVectors` acima — esse `crs` so controla a grade de calculo
    interna, nao o formato de saida. `shape()` das feicoes devolvia
    poligonos reais em graus (lon/lat), mas o codigo tratava essas
    coordenadas como se ja estivessem em `epsg_metrico` (metros) — daí
    `mapbiomas_geom.area` saía ~0 (area em graus^2 é uma fracao minuscula
    de area em m^2) e a comparacao contra `cluster_geom` (esse sim em
    metros) nunca podia ter overlap nenhum, nem por acidente."""
    import ee
    import geopandas as gpd
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

    geometrias_graus = [shape(f["geometry"]) for f in features]
    geometrias_metricas = gpd.GeoSeries(geometrias_graus, crs="EPSG:4326").to_crs(epsg_metrico)
    return unary_union(geometrias_metricas.tolist())
