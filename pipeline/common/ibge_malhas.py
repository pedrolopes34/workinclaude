"""Poligono oficial do municipio via API de malhas do IBGE.

Decisao (docs/DECISIONS.md secao 6.12): usa a API do IBGE sob demanda, por
codigo_ibge, em vez de depender do shapefile SP_Municipios_2024 que os
notebooks usavam localmente — esse shapefile ainda nao foi importado em
/geodata (README de /geodata). Mesma familia de API que ja usamos pra nome
de municipio (servicodados.ibge.gov.br), so que endpoint de malhas. Bloqueada
neste sandbox (docs/DECISIONS.md secao 6.2) — so testavel em GitHub Actions
ou localmente pelo Pedro, nao dentro desta sessao.
"""

import requests
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

URL_MALHA_MUNICIPIO = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{codigo_ibge}"
    "?formato=application/vnd.geo+json&qualidade=maxima"
)


def buscar_geometria_municipio(codigo_ibge: str, timeout_s: int = 60) -> BaseGeometry:
    """GeoJSON do IBGE para o município, convertido pra objeto shapely
    (WGS84/SIRGAS2000 — as duas coincidem na pratica para este uso, ver
    pipeline/stdbscan/core.py)."""
    resposta = requests.get(URL_MALHA_MUNICIPIO.format(codigo_ibge=codigo_ibge), timeout=timeout_s)
    resposta.raise_for_status()
    geojson = resposta.json()

    geometrias = [shape(feature["geometry"]) for feature in geojson["features"]]
    if not geometrias:
        raise ValueError(f"IBGE nao retornou geometria para codigo_ibge={codigo_ibge}")
    if len(geometrias) == 1:
        return geometrias[0]
    from shapely.ops import unary_union

    return unary_union(geometrias)
