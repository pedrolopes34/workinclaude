import requests

from pipeline.common.ibge_malhas import buscar_geometria_municipio

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

    def raise_for_status(self):
        pass

    def json(self):
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
    assert dormidas == [1]  # backoff 2**0 = 1s antes da 2ª tentativa
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
