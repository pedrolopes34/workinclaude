import json

import pytest
import requests

from pipeline.common import ibge_malhas
from pipeline.common.ibge_malhas import buscar_geometria_municipio, carregar_malha_estadual


@pytest.fixture(autouse=True)
def _cache_limpo():
    ibge_malhas._CACHE.clear()
    yield
    ibge_malhas._CACHE.clear()

_GEOJSON_OK = {
    "features": [
        {
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-48.9, -21.8], [-48.7, -21.8], [-48.7, -21.6], [-48.9, -21.6], [-48.9, -21.8]]],
            }
        }
    ]
}


class _RespostaFalsa:
    def __init__(self, payload):
        self._payload = payload
        self.content = b"" if payload is None else json.dumps(payload).encode()

    def raise_for_status(self):
        pass

    def json(self):
        if self._payload is None:
            raise requests.exceptions.JSONDecodeError("Expecting value", "", 0)
        return self._payload


def test_buscar_geometria_municipio_sucesso_de_primeira_nao_tenta_de_novo(monkeypatch):
    chamadas = []
    monkeypatch.setattr(
        "pipeline.common.ibge_malhas.requests.get", lambda *a, **k: chamadas.append(1) or _RespostaFalsa(_GEOJSON_OK)
    )
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: (_ for _ in ()).throw(AssertionError("nao deveria dormir")))

    geom = buscar_geometria_municipio("3519600")

    assert len(chamadas) == 1
    assert geom.is_valid


def test_buscar_geometria_municipio_tenta_de_novo_apos_falha_de_rede(monkeypatch):
    chamadas = []
    dormidas = []

    def get_fake(*a, **k):
        chamadas.append(1)
        if len(chamadas) == 1:
            raise requests.exceptions.ConnectTimeout("timeout simulado")
        return _RespostaFalsa(_GEOJSON_OK)

    monkeypatch.setattr("pipeline.common.ibge_malhas.requests.get", get_fake)
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: dormidas.append(s))

    geom = buscar_geometria_municipio("3519600")

    assert len(chamadas) == 2  # 1ª falhou, 2ª deu certo
    assert dormidas == [2]  # backoff 2 s antes da 2ª tentativa (seção 6.55)
    assert geom.is_valid


def test_buscar_geometria_municipio_lanca_o_ultimo_erro_se_todas_tentativas_falharem(monkeypatch):
    monkeypatch.setattr(
        "pipeline.common.ibge_malhas.requests.get",
        lambda *a, **k: (_ for _ in ()).throw(requests.exceptions.ConnectTimeout("sempre falha")),
    )
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: None)

    try:
        buscar_geometria_municipio("3519600", tentativas=3)
        assert False, "deveria ter lançado ConnectTimeout"
    except requests.exceptions.ConnectTimeout:
        pass


def test_resposta_vazia_do_ibge_tenta_de_novo(monkeypatch):
    """Consulta #15 (seção 6.55): o IBGE devolveu corpo vazio e o erro subiu
    como JSONDecodeError."""
    respostas = [_RespostaFalsa(None), _RespostaFalsa(None), _RespostaFalsa(_GEOJSON_OK)]
    dormidas = []
    monkeypatch.setattr("pipeline.common.ibge_malhas.requests.get", lambda *a, **k: respostas.pop(0))
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: dormidas.append(s))

    geom = buscar_geometria_municipio("3501608")

    assert geom.is_valid
    assert dormidas == [2, 4]


def test_malha_estadual_preenche_o_cache_e_evita_um_pedido_por_municipio(monkeypatch):
    estado = {
        "features": [
            {"properties": {"codarea": "3501608"}, "geometry": _GEOJSON_OK["features"][0]["geometry"]},
            {"properties": {"codarea": "3539509"}, "geometry": _GEOJSON_OK["features"][0]["geometry"]},
        ]
    }
    chamadas = []
    monkeypatch.setattr(
        "pipeline.common.ibge_malhas.requests.get", lambda url, **k: chamadas.append(url) or _RespostaFalsa(estado)
    )

    assert carregar_malha_estadual() == 2
    assert buscar_geometria_municipio("3501608").is_valid
    assert buscar_geometria_municipio("3539509").is_valid
    assert len(chamadas) == 1 and "estados/35" in chamadas[0]


def test_malha_estadual_indisponivel_nao_e_fatal(monkeypatch):
    monkeypatch.setattr(
        "pipeline.common.ibge_malhas.requests.get",
        lambda *a, **k: (_ for _ in ()).throw(requests.exceptions.ConnectTimeout("fora do ar")),
    )
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: None)

    assert carregar_malha_estadual() == 0
