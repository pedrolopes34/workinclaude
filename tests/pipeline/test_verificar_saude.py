from datetime import date, datetime, timedelta, timezone

import pytest

from pipeline import verificar_saude as v
from pipeline.verificar_saude import (
    Resultado,
    avaliar_consultas,
    avaliar_execucoes,
    avaliar_fonte_inpe,
    avaliar_ingestao,
    avaliar_miniaturas,
    avaliar_mosaico,
    avaliar_site,
    chave_das_falhas,
    corpo_do_alerta,
    decidir_acao,
    meses_aceitos,
    ultima_marca,
    ultimo_mes_completo,
)

AGORA = datetime(2026, 9, 28, 20, 41, tzinfo=timezone.utc)


def test_ultimo_mes_completo_vira_o_ano_em_janeiro():
    assert ultimo_mes_completo(date(2026, 9, 28)) == (2026, 8)
    assert ultimo_mes_completo(date(2027, 1, 15)) == (2026, 12)


def test_meses_aceitos_tolera_o_atraso_da_rodada_do_dia_1():
    assert meses_aceitos(date(2026, 10, 1)) == {(2026, 9), (2026, 8)}
    assert meses_aceitos(date(2026, 10, 3)) == {(2026, 9)}
    assert meses_aceitos(date(2027, 1, 2)) == {(2026, 12), (2026, 11)}


def test_ingestao_de_ontem_a_tarde_esta_ok():
    # a rodada de 27/09 às 22:40 (manual) vista às 20:41 do dia seguinte
    r = avaliar_ingestao(datetime(2026, 9, 27, 22, 40, tzinfo=timezone.utc), 645, AGORA)
    assert r.nivel == "ok"
    assert "há 22 h" in r.detalhe


def test_um_dia_inteiro_sem_ingestao_e_falha():
    r = avaliar_ingestao(AGORA - timedelta(hours=37), 645, AGORA)
    assert r.nivel == "falha"
    assert "sem atualizar desde" in r.detalhe


def test_ingestao_que_nao_cobre_os_645_e_falha():
    assert avaliar_ingestao(AGORA - timedelta(hours=2), 600, AGORA).nivel == "falha"


def test_ano_sem_linhas_so_e_atencao_na_virada():
    assert avaliar_ingestao(None, 0, datetime(2027, 1, 1, 20, tzinfo=timezone.utc)).nivel == "atencao"
    assert avaliar_ingestao(None, 0, AGORA).nivel == "falha"


def test_mosaico_do_ultimo_mes_completo_esta_ok():
    r = avaliar_mosaico((2026, 8), 104, date(2026, 9, 28))
    assert r.nivel == "ok"
    assert "104 meses" in r.detalhe


def test_mosaico_atrasado_e_falha_depois_da_tolerancia():
    assert avaliar_mosaico((2026, 8), 104, date(2026, 10, 1)).nivel == "ok"  # rodada do dia 1 ainda não veio
    r = avaliar_mosaico((2026, 8), 104, date(2026, 10, 3))
    assert r.nivel == "falha"
    assert "esperado 2026-09" in r.detalhe


def test_sem_mosaico_nenhum_e_falha():
    assert avaliar_mosaico(None, 0, date(2026, 9, 28)).nivel == "falha"


def test_miniaturas_de_um_mes_mais_novo_valem():
    # estado real em 28/09/2026: a rodada manual de 27/09 gravou 2026-09
    r = avaliar_miniaturas({(2026, 8): 0, (2026, 9): 645}, date(2026, 9, 28))
    assert r.nivel == "ok"
    assert "645 de 645" in r.detalhe and "2026-09" in r.detalhe


def test_miniaturas_so_de_mes_velho_e_falha():
    r = avaliar_miniaturas({(2026, 9): 0, (2026, 10): 0}, date(2026, 10, 15))
    assert r.nivel == "falha"
    assert "2026-09" in r.detalhe


def test_miniaturas_com_pouca_cobertura_e_atencao():
    assert avaliar_miniaturas({(2026, 9): 120}, date(2026, 10, 15)).nivel == "atencao"
    assert avaliar_miniaturas({(2026, 9): 400}, date(2026, 10, 15)).nivel == "ok"


def test_consultas_paradas_ou_com_erro_sao_falha():
    criado = datetime(2026, 9, 28, 10, tzinfo=timezone.utc)
    r = avaliar_consultas([(16, "pendente", criado)], [(17, "RequestException: IBGE fora")])
    assert r.nivel == "falha"
    assert "#16 parada em 'pendente'" in r.detalhe and "#17 com erro" in r.detalhe
    assert avaliar_consultas([], []).nivel == "ok"


def _execucao(caminho, conclusao, criada, nome=None):
    return {
        "path": caminho,
        "name": nome or caminho,
        "conclusion": conclusao,
        "created_at": criada,
        "html_url": f"https://github.com/x/y/actions/runs/{criada}",
    }


def test_falha_refeita_com_sucesso_nao_e_alerta():
    execucoes = [
        _execucao(".github/workflows/ingest-inpe.yml", "failure", "2026-09-28T10:00:00Z"),
        _execucao(".github/workflows/ingest-inpe.yml", "success", "2026-09-28T12:00:00Z"),
    ]
    assert avaliar_execucoes(execucoes).nivel == "ok"


def test_ultima_execucao_com_falha_e_alerta():
    execucoes = [
        _execucao(".github/workflows/ingest-inpe.yml", "success", "2026-09-27T14:00:00Z"),
        _execucao(".github/workflows/ingest-inpe.yml", "failure", "2026-09-28T14:00:00Z", "Ingestão INPE"),
    ]
    r = avaliar_execucoes(execucoes)
    assert r.nivel == "falha"
    assert "Ingestão INPE (failure)" in r.detalhe


def test_consultas_e_dependabot_ficam_fora_das_execucoes():
    execucoes = [
        _execucao(".github/workflows/consulta-sob-demanda.yml", "failure", "2026-09-28T11:50:00Z"),
        _execucao("dynamic/dependabot/dependabot-updates", "failure", "2026-09-28T11:00:00Z"),
        _execucao(".github/workflows/tests.yml", "success", "2026-09-28T11:00:00Z"),
    ]
    r = avaliar_execucoes(execucoes)
    assert r.nivel == "ok"
    assert r.detalhe.startswith("1 workflow")


def test_site_fora_do_ar_e_falha_e_sitemap_curto_e_atencao():
    assert avaliar_site({"/": 200, "/mapa": 500}, 645).nivel == "falha"
    assert avaliar_site({"/": 200, "/mapa": "ConnectTimeout"}, None).nivel == "falha"
    assert avaliar_site({"/": 200}, 63).nivel == "atencao"
    assert avaliar_site({"/": 200, "/mapa": 200}, 645).nivel == "ok"


def test_fonte_do_inpe_parada_e_so_atencao():
    assert avaliar_fonte_inpe(AGORA - timedelta(hours=5), AGORA).nivel == "ok"
    assert avaliar_fonte_inpe(AGORA - timedelta(days=4), AGORA).nivel == "atencao"
    assert avaliar_fonte_inpe(None, AGORA).nivel == "atencao"
    # dia 1: o arquivo do mês novo ainda pode não existir
    assert avaliar_fonte_inpe(None, datetime(2026, 10, 1, 20, tzinfo=timezone.utc)).nivel == "ok"


@pytest.mark.parametrize(
    "chave,aberta,anterior,acao",
    [
        ("A|B", False, None, "abrir"),
        ("A|B", True, "A|B", "nada"),  # mesma falha de ontem: sem spam
        ("A|B|C", True, "A|B", "comentar"),
        ("", True, "A|B", "fechar"),
        ("", False, None, "nada"),
    ],
)
def test_decidir_acao(chave, aberta, anterior, acao):
    assert decidir_acao(chave, aberta, anterior) == acao


def test_ultima_marca_le_a_mais_recente():
    textos = ["corpo <!-- falhas: A -->", "comentário sem marca", "comentário <!-- falhas: A|B -->"]
    assert ultima_marca(textos) == "A|B"
    assert ultima_marca(["nada aqui"]) is None


RESULTADOS = [
    Resultado("Site publicado", "ok", "8 endereços respondendo 200"),
    Resultado("Mapa do estado (leitura de satélite mensal)", "falha", "parou em 2026-08 (esperado 2026-09)"),
    Resultado("Focos do INPE (ingestão diária)", "falha", "sem atualizar | desde ontem"),
]


def test_chave_das_falhas_ignora_ok_e_ordena():
    assert chave_das_falhas(RESULTADOS) == "Focos do INPE (ingestão diária)|Mapa do estado (leitura de satélite mensal)"


def test_corpo_do_alerta_menciona_o_dono_e_guarda_a_marca():
    corpo = corpo_do_alerta(RESULTADOS, "https://github.com/x/y/actions/runs/1", "pedrolopes34")
    assert corpo.startswith("@pedrolopes34 a verificação diária encontrou 2 problema(s)")
    assert "sem atualizar \\| desde ontem" in corpo  # barra escapada na tabela
    assert ultima_marca([corpo]) == chave_das_falhas(RESULTADOS)


class _Resposta:
    def __init__(self, payload=None):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


@pytest.fixture
def github(monkeypatch):
    """GitHub falso: registra cada chamada; `issues` são as abertas."""
    estado = {"issues": [], "comentarios": [], "chamadas": []}
    monkeypatch.setenv("GITHUB_REPOSITORY", "pedrolopes34/workinclaude")
    monkeypatch.setenv("GITHUB_TOKEN", "token-falso")
    monkeypatch.setenv("GITHUB_RUN_ID", "99")
    monkeypatch.setenv("ALERTA_MENCAO", "pedrolopes34")

    def get(url, **k):
        estado["chamadas"].append(("GET", url, k.get("params")))
        return _Resposta(estado["comentarios"] if url.endswith("/comments") else estado["issues"])

    def post(url, **k):
        estado["chamadas"].append(("POST", url, k["json"]))
        return _Resposta({})

    def patch(url, **k):
        estado["chamadas"].append(("PATCH", url, k["json"]))
        return _Resposta({})

    monkeypatch.setattr(v.requests, "get", get)
    monkeypatch.setattr(v.requests, "post", post)
    monkeypatch.setattr(v.requests, "patch", patch)
    return estado


ISSUE_ABERTA = {
    "title": "Alerta do painel: Mapa do estado (leitura de satélite mensal)",
    "body": "... <!-- falhas: Mapa do estado (leitura de satélite mensal) -->",
    "comments_url": "https://api.github.com/repos/pedrolopes34/workinclaude/issues/7/comments",
    "url": "https://api.github.com/repos/pedrolopes34/workinclaude/issues/7",
}


def test_alertar_abre_issue_quando_nao_ha_nenhuma(github):
    assert v.alertar(RESULTADOS) == "abrir"
    metodo, url, corpo = github["chamadas"][-1]
    assert (metodo, url) == ("POST", "https://api.github.com/repos/pedrolopes34/workinclaude/issues")
    assert corpo["title"].startswith("Alerta do painel: Mapa do estado")
    assert "@pedrolopes34" in corpo["body"] and "actions/runs/99" in corpo["body"]
    # só procura issue aberta pelo próprio workflow
    assert github["chamadas"][0][2]["creator"] == "github-actions[bot]"


def test_alertar_comenta_so_quando_as_falhas_mudam(github):
    github["issues"] = [ISSUE_ABERTA]
    assert v.alertar(RESULTADOS) == "comentar"  # entrou a falha da ingestão
    assert github["chamadas"][-1][:2] == ("POST", ISSUE_ABERTA["comments_url"])

    github["comentarios"] = [{"body": github["chamadas"][-1][2]["body"]}]
    antes = len(github["chamadas"])
    assert v.alertar(RESULTADOS) == "nada"
    assert all(metodo == "GET" for metodo, _, _ in github["chamadas"][antes:])


def test_alertar_fecha_a_issue_quando_tudo_volta_ao_normal(github):
    github["issues"] = [ISSUE_ABERTA]
    assert v.alertar([Resultado("Site publicado", "ok", "tudo certo")]) == "fechar"
    comentario, fechamento = github["chamadas"][-2:]
    assert comentario[:2] == ("POST", ISSUE_ABERTA["comments_url"]) and "Tudo normal de novo" in comentario[2]["body"]
    assert fechamento == ("PATCH", ISSUE_ABERTA["url"], {"state": "closed", "state_reason": "completed"})


def test_alertar_ignora_pull_request_e_issue_de_outro_titulo(github):
    github["issues"] = [
        {**ISSUE_ABERTA, "title": "Outra coisa"},
        {**ISSUE_ABERTA, "pull_request": {"url": "..."}},
    ]
    assert v.alertar(RESULTADOS) == "abrir"


# Trecho real do JS publicado (29/09/2026, investigação da seção 6.56): o
# @vercel/analytics 2.x com a configuração que a Vercel embute no build.
_CHUNK_BIBLIOTECA = (
    'src:(n=o).scriptSrc?l(n.scriptSrc):a()?"https://va.vercel-scripts.com/v1/script.debug.js":'
    'n.basePath?l(`${n.basePath}/insights/script.js`):"/_vercel/insights/script.js",dataset:u}'
)
_CHUNK_CONFIG = (
    "basePath:function(){if(void 0!==t.default&&void 0!==t.default.env)return "
    "t.default.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH}(),configString:function(){if(void 0!==t.default"
    '&&void 0!==t.default.env)return\'{"analytics":{"scriptSrc":"fb8fa6a264f1635a/script.js",'
    '"viewEndpoint":"fb8fa6a264f1635a/view"}}\'}()'
)


def test_script_do_analytics_sai_da_configuracao_embutida():
    endereco, origem = v.endereco_script_analytics(["outro chunk", _CHUNK_BIBLIOTECA + _CHUNK_CONFIG])
    assert endereco == "/fb8fa6a264f1635a/script.js"
    assert origem == "configuração da Vercel no build"


def test_configuracao_com_aspas_escapadas_tambem_vale():
    chunk = 'x="{\\"analytics\\":{\\"scriptSrc\\":\\"abc123/script.js\\"}}"'
    assert v.endereco_script_analytics([chunk])[0] == "/abc123/script.js"


def test_caminho_base_embutido():
    chunk = _CHUNK_BIBLIOTECA + 'basePath:function(){if(void 0!==t.default)return"/meu-caminho"}()'
    assert v.endereco_script_analytics([chunk]) == ("/meu-caminho/insights/script.js", "caminho base da Vercel no build")


def test_sem_configuracao_usa_o_padrao_e_sem_biblioteca_nao_ha_endereco():
    assert v.endereco_script_analytics([_CHUNK_BIBLIOTECA]) == ("/_vercel/insights/script.js", "padrão")
    assert v.endereco_script_analytics(["nada aqui"])[0] is None


def test_avaliar_analytics():
    assert v.avaliar_analytics("/fb8fa6a264f1635a/script.js", "configuração da Vercel no build", 200).nivel == "ok"
    desligado = v.avaliar_analytics("/_vercel/insights/script.js", "padrão", 404)
    assert desligado.nivel == "atencao" and "desligado" in desligado.detalhe
    assert v.avaliar_analytics(None, "biblioteca de métricas não encontrada no JS do site", None).nivel == "atencao"
