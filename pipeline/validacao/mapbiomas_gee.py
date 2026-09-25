"""Busca a área queimada do MapBiomas Fogo (Earth Engine) pra um
município/ano — a "outra fonte independente" contra a qual o ST-DBSCAN é
comparado (docs/DECISIONS.md seção 6.15).

NÃO CONFIRMADO — asset e convenção de banda são suposições, não extraídas
de nenhum notebook lido nesta sessão (domínio do MapBiomas bloqueado pro
fetch direto neste sandbox, mesmo padrão da seção 6.9/6.12). Pedro não
tinha isso de cabeça; ver docs/DECISIONS.md seção 6.15 pelos 2 candidatos
de asset encontrados por busca na web, nenhum verificado contra a fonte
primária. Assumido abaixo: Coleção 4 mensal, 40 bandas (1 por ano,
1985–2024), banda selecionada por ÍNDICE (ano - 1985), não por nome — mais
robusto a variação de nome de banda entre coleções, mas a lógica de
"pixel > 0 = queimou naquele ano" (documentada em CONTEXTO_PROJETO.md)
também não foi verificada contra o dado real.
"""

ASSET_MAPBIOMAS_FOGO_MENSAL = (
    "projects/mapbiomas-public/assets/brazil/fire/collection4/mapbiomas_fire_collection4_monthly_burned_v1"
)
PRIMEIRO_ANO_COLECAO = 1985


def buscar_area_queimada(area_ee, ano: int, epsg_metrico: int, scale: int = 30):
    """Poligono (shapely, na projecao epsg_metrico) da area que o MapBiomas
    Fogo classificou como queimada em algum mes do `ano`, dentro de
    `area_ee` (ee.Geometry do municipio). Poligono vazio se nao houver
    nenhum pixel queimado."""
    import ee
    from shapely.geometry import shape
    from shapely.ops import unary_union

    indice_banda = ano - PRIMEIRO_ANO_COLECAO
    colecao = ee.Image(ASSET_MAPBIOMAS_FOGO_MENSAL)
    banda_ano = colecao.select([indice_banda])
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
    if not features:
        from shapely.geometry import GeometryCollection

        return GeometryCollection()

    geometrias = [shape(f["geometry"]) for f in features]
    return unary_union(geometrias)
