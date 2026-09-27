"""Poligono oficial do municipio via API de malhas do IBGE.

Decisao (docs/DECISIONS.md secao 6.12): usa a API do IBGE sob demanda, por
codigo_ibge, em vez de depender do shapefile SP_Municipios_2024 que os
notebooks usavam localmente — esse shapefile ainda nao foi importado em
/geodata (README de /geodata). Mesma familia de API que ja usamos pra nome
de municipio (servicodados.ibge.gov.br), so que endpoint de malhas. Bloqueada
neste sandbox (docs/DECISIONS.md secao 6.2) — so testavel em GitHub Actions
ou localmente pelo Pedro, nao dentro desta sessao.

Retry com backoff (secao 6.23/6.26): rodadas reais de producao mostraram
`ConnectTimeout` esparso, espalhado entre municipios diferentes a cada
rodada — flakiness da API sob muitas chamadas sequenciais (645 municipios,
uma request cada, sem retry). Nao e sistematico (nao e sempre o mesmo
municipio), entao uma nova tentativa geralmente resolve.

Secao 6.55: a consulta #15 (Americana, ago/2026) falhou com o IBGE
devolvendo corpo VAZIO nas 3 tentativas (1 s e 2 s de espera) — enquanto 14
jobs de validacao pediam geometria ao mesmo tempo. Agora sao 5 tentativas
(2, 4, 8 e 16 s), resposta vazia conta como falha, e as rodadas em lote
(validacao, dNBR mensal) baixam a malha do ESTADO inteiro numa requisicao
so (`carregar_malha_estadual`), em vez de uma por municipio; se essa falhar,
cada municipio volta a ser pedido sozinho.
"""

import time

import requests
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

URL_MALHA_MUNICIPIO = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{codigo_ibge}"
    "?formato=application/vnd.geo+json&qualidade=maxima"
)
# A mesma malha, todos os municipios de SP (codigo 35) de uma vez.
URL_MALHA_ESTADO_POR_MUNICIPIO = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35"
    "?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=maxima"
)

# codigo_ibge -> geometria ja baixada nesta execucao
_CACHE: dict[str, BaseGeometry] = {}


def _baixar_geojson(url: str, timeout_s: int, tentativas: int) -> dict:
    """GET com backoff (2, 4, 8, 16 s...). Corpo vazio ou JSON invalido conta
    como falha e tenta de novo; levanta o ultimo erro se todas falharem."""
    erro: Exception | None = None
    for tentativa in range(tentativas):
        try:
            resposta = requests.get(url, timeout=timeout_s)
            resposta.raise_for_status()
            if not resposta.content.strip():
                raise requests.exceptions.RequestException("IBGE devolveu resposta vazia")
            return resposta.json()
        except (requests.exceptions.RequestException, ValueError) as e:
            erro = e
            if tentativa < tentativas - 1:
                time.sleep(2 ** (tentativa + 1))
    raise erro  # type: ignore[misc]


def _geometria_da_feicao(features: list[dict]) -> BaseGeometry:
    geometrias = [shape(f["geometry"]) for f in features]
    if len(geometrias) == 1:
        return geometrias[0]
    from shapely.ops import unary_union

    return unary_union(geometrias)


def carregar_malha_estadual(timeout_s: int = 180, tentativas: int = 5) -> int:
    """Baixa a malha de todos os municipios de SP numa requisicao e guarda no
    cache. Devolve quantos municipios entraram; 0 se falhou (nao e fatal:
    `buscar_geometria_municipio` volta a pedir municipio por municipio)."""
    try:
        geojson = _baixar_geojson(URL_MALHA_ESTADO_POR_MUNICIPIO, timeout_s, tentativas)
    except Exception as e:
        print(f"[AVISO] malha estadual do IBGE indisponivel, seguindo municipio por municipio: {type(e).__name__}: {e}")
        return 0
    por_codigo: dict[str, list[dict]] = {}
    for feature in geojson.get("features", []):
        codigo = str((feature.get("properties") or {}).get("codarea", ""))
        if len(codigo) == 7:
            por_codigo.setdefault(codigo, []).append(feature)
    for codigo, features in por_codigo.items():
        _CACHE[codigo] = _geometria_da_feicao(features)
    return len(por_codigo)


def buscar_geometria_municipio(codigo_ibge: str, timeout_s: int = 60, tentativas: int = 5) -> BaseGeometry:
    """GeoJSON do IBGE para o município, convertido pra objeto shapely
    (WGS84/SIRGAS2000 — as duas coincidem na pratica para este uso, ver
    pipeline/stdbscan/core.py). Usa o cache (malha estadual ja baixada, ou o
    mesmo municipio pedido antes nesta execucao); senao pede so ele, com
    backoff — levanta o último erro se todas as tentativas falharem."""
    if codigo_ibge in _CACHE:
        return _CACHE[codigo_ibge]
    geojson = _baixar_geojson(URL_MALHA_MUNICIPIO.format(codigo_ibge=codigo_ibge), timeout_s, tentativas)
    features = geojson.get("features", [])
    if not features:
        raise ValueError(f"IBGE nao retornou geometria para codigo_ibge={codigo_ibge}")
    _CACHE[codigo_ibge] = _geometria_da_feicao(features)
    return _CACHE[codigo_ibge]
