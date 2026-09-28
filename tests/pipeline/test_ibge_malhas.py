import json

import pytest
import requests

from pipeline.common import ibge_malhas
from pipeline.common.ibge_malhas import buscar_geometria_municipio, carregar_malha_estadual


@pytest.fixture(autouse=True)
def _cache_limpo(monkeypatch):
    ibge_malhas._CACHE.clear()
    monkeypatch.setattr(ibge_malhas, "_MALHA_ESTADUAL_TENTADA", False)
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


class _RespostaNaoJson:
    """HTTP de sucesso com corpo que não é JSON — o que o IBGE devolveu nas 5
    tentativas da consulta #15 refeita em 28/09."""

    status_code = 200
    headers = {"content-type": "text/html"}
    text = "<!DOCTYPE html><html><body>indisponivel</body></html>"
    content = text.encode()

    def raise_for_status(self):
        pass

    def json(self):
        raise requests.exceptions.JSONDecodeError("Expecting value", self.text, 0)


_ESTADO_COM_AMERICANA = {
    "features": [{"properties": {"codarea": "3501608"}, "geometry": _GEOJSON_OK["features"][0]["geometry"]}]
}


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


def test_corpo_que_nao_e_json_vira_erro_curto_e_o_trecho_vai_pro_log(monkeypatch, capsys):
    monkeypatch.setattr("pipeline.common.ibge_malhas.requests.get", lambda *a, **k: _RespostaNaoJson())
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: None)

    with pytest.raises(requests.exceptions.RequestException) as erro:
        ibge_malhas._baixar_geojson("https://exemplo", timeout_s=1, tentativas=2)

    # curta: vira a mensagem de erro que o visitante vê
    assert str(erro.value) == "IBGE devolveu resposta que nao e JSON (HTTP 200, text/html)"
    log = capsys.readouterr().out
    assert "tentativa 1/2" in log and "tentativa 2/2" in log
    assert "<!DOCTYPE html>" in log


def test_municipio_indisponivel_sai_da_malha_do_estado(monkeypatch):
    """Consulta #15 refeita (28/09): o endpoint do município devolvia algo que
    não é JSON; a malha do estado, do mesmo serviço, respondia."""
    pedidos = []

    def get_fake(url, **k):
        pedidos.append(url)
        return _RespostaFalsa(_ESTADO_COM_AMERICANA) if "estados/35" in url else _RespostaNaoJson()

    monkeypatch.setattr("pipeline.common.ibge_malhas.requests.get", get_fake)
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: None)

    geom = buscar_geometria_municipio("3501608")

    assert geom.is_valid
    assert sum("municipios/3501608" in u for u in pedidos) == 5
    assert sum("estados/35" in u for u in pedidos) == 1


def test_sem_malha_do_estado_sobe_o_erro_do_municipio(monkeypatch):
    def get_fake(url, **k):
        if "estados/35" in url:
            raise requests.exceptions.ConnectTimeout("estado fora do ar")
        return _RespostaNaoJson()

    monkeypatch.setattr("pipeline.common.ibge_malhas.requests.get", get_fake)
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: None)

    with pytest.raises(requests.exceptions.RequestException, match="nao e JSON"):
        buscar_geometria_municipio("3501608", tentativas=2)


def test_malha_do_estado_so_e_tentada_uma_vez_por_execucao(monkeypatch):
    """Numa rodada em lote que já pediu a malha do estado (e falhou), cada
    município que falhar não repete o download pesado."""
    pedidos = []

    def get_fake(url, **k):
        pedidos.append(url)
        if "estados/35" in url:
            raise requests.exceptions.ConnectTimeout("estado fora do ar")
        return _RespostaNaoJson()

    monkeypatch.setattr("pipeline.common.ibge_malhas.requests.get", get_fake)
    monkeypatch.setattr("pipeline.common.ibge_malhas.time.sleep", lambda s: None)

    assert carregar_malha_estadual(tentativas=2) == 0
    for codigo in ("3501608", "3539509"):
        with pytest.raises(requests.exceptions.RequestException):
            buscar_geometria_municipio(codigo, tentativas=2)

    assert sum("estados/35" in u for u in pedidos) == 2  # só as 2 tentativas do começo
