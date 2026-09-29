"""Verificação diária de saúde do painel (docs/DECISIONS.md seção 6.56).

    python -m pipeline.verificar_saude             # só verifica e imprime
    python -m pipeline.verificar_saude --alertar   # + abre/atualiza/fecha a issue de alerta

Nasceu do incidente da seção 6.49: a cota do GitHub Actions esgotou, o cron
diário parou e ninguém ficou sabendo — só apareceu investigando o mapa. Roda
todo dia no Actions (`saude-diaria.yml`; o sandbox do Claude Code não alcança
Neon, INPE nem o site) e confere o que o visitante veria de errado:

1. focos do INPE: a ingestão diária atualizou todas as linhas do ano corrente
   nas últimas 36 h (uma rodada atrasada passa; um dia inteiro sem rodar, não);
2. mapa do estado: existe o mosaico do último mês completo;
3. miniaturas municipais: a rodada mensal gerou as do último mês completo;
4. consultas por mês: nenhuma parada nem com erro nas últimas 24 h;
5. execuções na main: a mais recente de cada workflow não terminou em falha;
6. site: páginas principais, sitemap com os 645, CSV e uma imagem do mapa;
7. INPE: o arquivo do mês corrente continua sendo atualizado (só atenção —
   é a fonte, não o nosso pipeline); Vercel Analytics ativo (só atenção).

Cada verificação vira `Resultado(nome, nivel, detalhe)`, nível "ok",
"atencao" ou "falha". Qualquer falha: sai com código 1 (o workflow fica
vermelho) e, com `--alertar`, abre uma issue "Alerta do painel" mencionando o
dono do repositório (o GitHub manda e-mail); falhas novas viram comentário na
mesma issue, e ela é fechada sozinha quando tudo volta ao normal. Atenção só
aparece no resumo da execução.
"""

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import requests

SITE_PUBLICADO = "https://workinclaude.vercel.app"
PAGINAS = ("/", "/mapa", "/municipio/3539509", "/comparar", "/como-produzimos", "/quem-somos")
TOTAL_MUNICIPIOS = 645
HORAS_MAX_SEM_INGESTAO = 36
DIAS_TOLERANCIA_MENSAL = 2  # as rodadas do dia 1 atrasam no Actions
# Consultas por mês disparadas pelo visitante: o estado de cada uma já está
# no banco (verificação 4), inclusive depois de refeita — a execução que
# falhou não entra na verificação 5.
WORKFLOWS_FORA_DA_VERIFICACAO = ("consulta-sob-demanda.yml", "saude-diaria.yml")
TITULO_ISSUE = "Alerta do painel"
_MARCA = re.compile(r"<!-- falhas: (.*?) -->")
# @vercel/analytics 2.x (webapp/package.json): com o Analytics ligado, a
# Vercel embute no JS do site, no build, a configuração do projeto —
# NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG, ex.
# '{"analytics":{"scriptSrc":"<caminho do projeto>/script.js",...}}' — ou um
# caminho base (NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH). Só sem nenhum dos
# dois o script sai de /_vercel/insights/script.js (seção 6.56: conferir esse
# endereço fixo dava 404 com o Analytics ligado).
_CONFIG_ANALYTICS = re.compile(r'\\?"analytics\\?":\{[^{}]*?\\?"scriptSrc\\?":\\?"([^"\\]+)')
_BASE_ANALYTICS = re.compile(r'basePath:function\(\)\{[^{}]*?return"(/[^"]*)"\}')
SCRIPT_ANALYTICS_PADRAO = "/_vercel/insights/script.js"


@dataclass(frozen=True)
class Resultado:
    nome: str
    nivel: str  # "ok" | "atencao" | "falha"
    detalhe: str


# --- regras (puras, testadas em tests/pipeline/test_verificar_saude.py) ---


def ultimo_mes_completo(hoje: date) -> tuple[int, int]:
    return (hoje.year - 1, 12) if hoje.month == 1 else (hoje.year, hoje.month - 1)


def meses_aceitos(hoje: date) -> set[tuple[int, int]]:
    """O último mês completo; nos primeiros dias do mês, também o anterior
    (a rodada do dia 1 ainda pode não ter acontecido)."""
    esperado = ultimo_mes_completo(hoje)
    if hoje.day > DIAS_TOLERANCIA_MENSAL:
        return {esperado}
    return {esperado, ultimo_mes_completo(date(esperado[0], esperado[1], 1))}


def _rotulo(mes: tuple[int, int]) -> str:
    return f"{mes[0]}-{mes[1]:02d}"


def avaliar_ingestao(ultima_completa: datetime | None, linhas: int, agora: datetime) -> Resultado:
    nome = "Focos do INPE (ingestão diária)"
    if ultima_completa is None or linhas == 0:
        if agora.timetuple().tm_yday <= 2:
            return Resultado(nome, "atencao", f"ano {agora.year} ainda sem linhas (virada do ano)")
        return Resultado(nome, "falha", f"nenhuma linha de {agora.year} no banco")
    horas = (agora - ultima_completa).total_seconds() / 3600
    quando = f"{ultima_completa:%d/%m %H:%M} UTC (há {horas:.0f} h)"
    if linhas < TOTAL_MUNICIPIOS:
        return Resultado(nome, "falha", f"só {linhas} de {TOTAL_MUNICIPIOS} municípios com linha em {agora.year}")
    if horas > HORAS_MAX_SEM_INGESTAO:
        return Resultado(nome, "falha", f"sem atualizar desde {quando}")
    return Resultado(nome, "ok", f"todas as {linhas} linhas de {agora.year} atualizadas até {quando}")


def avaliar_mosaico(ultimo: tuple[int, int] | None, total: int, hoje: date) -> Resultado:
    nome = "Mapa do estado (leitura de satélite mensal)"
    esperado = ultimo_mes_completo(hoje)
    if ultimo is None:
        return Resultado(nome, "falha", "nenhum mês no banco")
    if ultimo in meses_aceitos(hoje) or ultimo > esperado:
        return Resultado(nome, "ok", f"{total} meses, o mais recente {_rotulo(ultimo)}")
    return Resultado(nome, "falha", f"parou em {_rotulo(ultimo)} (esperado {_rotulo(esperado)})")


def avaliar_miniaturas(com_mes: dict[tuple[int, int], int], hoje: date) -> Resultado:
    """`com_mes`: {mês: quantos municípios têm a miniatura dele}, pros meses
    aceitos e o corrente. Vale o último mês completo ou um mais novo (um
    disparo manual no meio do mês, como o de 27/09/2026, grava o mês
    corrente). Mês nublado deixa municípios sem leitura (a linha fica com a
    do mês anterior), então só 0 é falha; pouca cobertura é atenção."""
    nome = "Miniaturas municipais (leitura de satélite mensal)"
    aceitos = meses_aceitos(hoje)
    validos = {m: n for m, n in com_mes.items() if n > 0 and (m in aceitos or m > ultimo_mes_completo(hoje))}
    mes, n = max(validos.items(), key=lambda item: (item[1], item[0])) if validos else (ultimo_mes_completo(hoje), 0)
    if n == 0:
        return Resultado(nome, "falha", f"nenhum município com a leitura de {_rotulo(ultimo_mes_completo(hoje))}")
    detalhe = f"{n} de {TOTAL_MUNICIPIOS} municípios com a leitura de {_rotulo(mes)}"
    if n < 0.3 * TOTAL_MUNICIPIOS:
        return Resultado(nome, "atencao", detalhe + " (pouca — nuvem ou rodada incompleta)")
    return Resultado(nome, "ok", detalhe)


def avaliar_consultas(paradas: list[tuple], com_erro: list[tuple]) -> Resultado:
    """`paradas`: (id, status, criado_em); `com_erro`: (id, mensagem)."""
    nome = "Consultas por mês (últimas 24 h)"
    problemas = [f"#{i} parada em '{s}' desde {c:%d/%m %H:%M} UTC" for i, s, c in paradas]
    problemas += [f"#{i} com erro: {m}" for i, m in com_erro]
    if problemas:
        return Resultado(nome, "falha", "; ".join(problemas))
    return Resultado(nome, "ok", "nenhuma parada nem com erro")


def ultimas_por_workflow(execucoes: list[dict]) -> dict[str, dict]:
    """Só a execução mais recente de cada workflow: uma falha já refeita com
    sucesso não é alerta."""
    ultimas: dict[str, dict] = {}
    for e in sorted(execucoes, key=lambda e: e["created_at"]):
        # Só os workflows do repositório (fora: as execuções internas do
        # Dependabot, `dynamic/...`).
        if not e.get("path", "").startswith(".github/workflows/"):
            continue
        caminho = e["path"].rsplit("/", 1)[-1]
        if caminho in WORKFLOWS_FORA_DA_VERIFICACAO:
            continue
        ultimas[caminho] = e
    return ultimas


def avaliar_execucoes(execucoes: list[dict]) -> Resultado:
    nome = "Execuções do pipeline na main (últimas 26 h)"
    ultimas = ultimas_por_workflow(execucoes)
    falhas = [e for e in ultimas.values() if e.get("conclusion") in ("failure", "timed_out", "startup_failure")]
    if falhas:
        return Resultado(nome, "falha", "; ".join(f"{e['name']} ({e['conclusion']}): {e['html_url']}" for e in falhas))
    return Resultado(nome, "ok", f"{len(ultimas)} workflow(s) com a última execução sem falha")


def avaliar_site(respostas: dict[str, int | str], municipios_no_sitemap: int | None) -> Resultado:
    """`respostas`: {caminho: status HTTP ou nome do erro}."""
    nome = "Site publicado"
    fora = [f"{c} → {s}" for c, s in respostas.items() if s != 200]
    if fora:
        return Resultado(nome, "falha", "; ".join(fora))
    if municipios_no_sitemap is not None and municipios_no_sitemap < TOTAL_MUNICIPIOS:
        return Resultado(nome, "atencao", f"páginas no ar, mas o sitemap lista {municipios_no_sitemap} municípios")
    return Resultado(nome, "ok", f"{len(respostas)} endereços respondendo 200")


def avaliar_fonte_inpe(ultima_modificacao: datetime | None, agora: datetime) -> Resultado:
    nome = "Arquivo do INPE do mês (fonte)"
    if agora.day <= DIAS_TOLERANCIA_MENSAL:
        return Resultado(nome, "ok", "início do mês — arquivo novo ainda pode não existir")
    if ultima_modificacao is None:
        return Resultado(nome, "atencao", "não deu pra ler a data do arquivo do mês")
    horas = (agora - ultima_modificacao).total_seconds() / 3600
    detalhe = f"atualizado em {ultima_modificacao:%d/%m %H:%M} UTC (há {horas:.0f} h)"
    return Resultado(nome, "atencao" if horas > 72 else "ok", detalhe)


def endereco_script_analytics(textos_js: list[str]) -> tuple[str | None, str]:
    """(endereço do script de métricas, de onde veio), na mesma ordem da
    biblioteca: `scriptSrc` da configuração embutida, caminho base embutido
    ou o padrão. None quando a biblioteca nem está no JS do site."""
    for js in textos_js:
        achado = _CONFIG_ANALYTICS.search(js)
        if achado:
            src = achado.group(1)
            return (src if src.startswith(("http://", "https://", "/")) else f"/{src}"), "configuração da Vercel no build"
    for js in textos_js:
        achado = _BASE_ANALYTICS.search(js)
        if achado:
            return f"{achado.group(1).rstrip('/')}/insights/script.js", "caminho base da Vercel no build"
    if any("/insights/script.js" in js for js in textos_js):
        return SCRIPT_ANALYTICS_PADRAO, "padrão"
    return None, "biblioteca de métricas não encontrada no JS do site"


def avaliar_analytics(endereco: str | None, origem: str, status: int | str | None) -> Resultado:
    nome = "Vercel Analytics"
    if endereco is None:
        return Resultado(nome, "atencao", origem)
    if status == 200:
        return Resultado(nome, "ok", f"ativo — script em {endereco} ({origem})")
    if origem == "padrão":
        return Resultado(
            nome,
            "atencao",
            f"{endereco} → {status}, sem configuração da Vercel no JS do site: "
            "Analytics desligado, ou ligado depois do último deploy",
        )
    return Resultado(nome, "atencao", f"{endereco} → {status} ({origem})")


def chave_das_falhas(resultados: list[Resultado]) -> str:
    return "|".join(sorted(r.nome for r in resultados if r.nivel == "falha"))


def decidir_acao(chave: str, issue_aberta: bool, chave_anterior: str | None) -> str:
    """"abrir" | "comentar" | "fechar" | "nada" — uma issue aberta por vez;
    comenta só quando o conjunto de falhas muda (sem spam diário)."""
    if chave:
        if not issue_aberta:
            return "abrir"
        return "nada" if chave == chave_anterior else "comentar"
    return "fechar" if issue_aberta else "nada"


def ultima_marca(textos: list[str]) -> str | None:
    """Chave das falhas registrada por último na issue (corpo + comentários)."""
    marcas = [m for texto in textos for m in _MARCA.findall(texto or "")]
    return marcas[-1] if marcas else None


_ICONE = {"ok": "✅", "atencao": "⚠️", "falha": "❌"}


def tabela_markdown(resultados: list[Resultado]) -> str:
    linhas = ["| | Verificação | Detalhe |", "|---|---|---|"]
    for r in resultados:
        detalhe = r.detalhe.replace("|", "\\|").replace("\n", " ")
        linhas.append(f"| {_ICONE[r.nivel]} | {r.nome} | {detalhe} |")
    return "\n".join(linhas)


def corpo_do_alerta(resultados: list[Resultado], url_execucao: str, mencao: str | None) -> str:
    falhas = [r for r in resultados if r.nivel == "falha"]
    aviso = f"@{mencao} " if mencao else ""
    return (
        f"{aviso}a verificação diária encontrou {len(falhas)} problema(s) no painel.\n\n"
        f"{tabela_markdown(resultados)}\n\n"
        f"Execução: {url_execucao}\n\n"
        "Esta issue é aberta e fechada pelo workflow `saude-diaria.yml` "
        "(docs/DECISIONS.md seção 6.56): ela se fecha sozinha quando tudo voltar ao normal.\n\n"
        f"<!-- falhas: {chave_das_falhas(resultados)} -->"
    )


# --- coleta (banco, HTTP, GitHub) ---


def _coletar_banco(agora: datetime) -> list[Resultado]:
    from pipeline.common.db import get_connection

    hoje = agora.date()
    resultados = []
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT min(atualizado_em), count(*) FROM metricas_anuais WHERE ano = %s", (agora.year,))
        ultima, linhas = cur.fetchone()
        resultados.append(avaliar_ingestao(ultima, linhas, agora))

        cur.execute("SELECT to_regclass('mosaicos_dnbr') IS NOT NULL")
        if cur.fetchone()[0]:
            cur.execute("SELECT ano, mes, count(*) OVER () FROM mosaicos_dnbr ORDER BY ano DESC, mes DESC LIMIT 1")
            linha = cur.fetchone()
            resultados.append(avaliar_mosaico((linha[0], linha[1]) if linha else None, linha[2] if linha else 0, hoje))
        else:
            resultados.append(avaliar_mosaico(None, 0, hoje))

        com_mes = {}
        for ano, mes in meses_aceitos(hoje) | {(hoje.year, hoje.month)}:
            cur.execute(
                "SELECT count(*) FROM metricas_anuais WHERE ano = %s AND dnbr_imagem_url LIKE %s",
                (ano, f"%-{ano}-{mes:02d}.png"),
            )
            com_mes[(ano, mes)] = cur.fetchone()[0]
        resultados.append(avaliar_miniaturas(com_mes, hoje))

        cur.execute("SELECT to_regclass('consultas_sob_demanda') IS NOT NULL")
        if cur.fetchone()[0]:
            cur.execute(
                "SELECT id, status, criado_em FROM consultas_sob_demanda "
                "WHERE status IN ('pendente', 'processando') "
                "AND criado_em BETWEEN now() - interval '24 hours' AND now() - interval '15 minutes' ORDER BY id"
            )
            paradas = cur.fetchall()
            cur.execute(
                "SELECT id, coalesce(mensagem_erro, '') FROM consultas_sob_demanda "
                "WHERE status = 'erro' AND concluido_em > now() - interval '24 hours' ORDER BY id"
            )
            resultados.append(avaliar_consultas(paradas, cur.fetchall()))
    return resultados


def _cabecalhos_github() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
    }


def _coletar_execucoes(agora: datetime) -> Resultado:
    repositorio = os.environ.get("GITHUB_REPOSITORY")
    if not (repositorio and os.environ.get("GITHUB_TOKEN")):
        return Resultado("Execuções do pipeline na main (últimas 26 h)", "atencao", "sem GITHUB_TOKEN — não verificado")
    desde = (agora - timedelta(hours=26)).strftime("%Y-%m-%dT%H:%M:%SZ")
    resposta = requests.get(
        f"https://api.github.com/repos/{repositorio}/actions/runs",
        params={"branch": "main", "created": f">={desde}", "status": "completed", "per_page": 100},
        headers=_cabecalhos_github(),
        timeout=30,
    )
    resposta.raise_for_status()
    return avaliar_execucoes(resposta.json().get("workflow_runs", []))


def _status(url: str) -> int | str:
    try:
        return requests.get(url, timeout=30).status_code
    except requests.RequestException as e:
        return type(e).__name__


def _coletar_site() -> list[Resultado]:
    respostas: dict[str, int | str] = {caminho: _status(SITE_PUBLICADO + caminho) for caminho in PAGINAS}
    municipios_no_sitemap = None
    try:
        sitemap = requests.get(f"{SITE_PUBLICADO}/sitemap.xml", timeout=30)
        respostas["/sitemap.xml"] = sitemap.status_code
        municipios_no_sitemap = len(re.findall(r"<loc>[^<]*/municipio/\d{7}</loc>", sitemap.text))
    except requests.RequestException as e:
        respostas["/sitemap.xml"] = type(e).__name__
    try:
        csv = requests.get(f"{SITE_PUBLICADO}/dados/municipios.csv", timeout=60)
        respostas["/dados/municipios.csv"] = csv.status_code if "csv" in csv.headers.get("content-type", "") else "não é CSV"
    except requests.RequestException as e:
        respostas["/dados/municipios.csv"] = type(e).__name__

    # Uma imagem do mapa do estado, a partir do /mapa (o endereço que o
    # navegador recebe, não o gravado no banco).
    resultados = []
    try:
        mapa = requests.get(f"{SITE_PUBLICADO}/mapa", timeout=30).text
        urls = re.findall(r"https?://[^\"'\\\s]+?/dnbr-estado/\d{4}-\d{2}\.webp", mapa)
        if urls:
            imagem = requests.get(max(urls), timeout=30)
            ok = imagem.status_code == 200 and imagem.headers.get("content-type", "").startswith("image/")
            respostas[f"imagem {max(urls).rsplit('/', 1)[-1]}"] = 200 if ok else imagem.status_code
        else:
            resultados.append(Resultado("Mapa do estado no site", "atencao", "o /mapa não trouxe nenhuma imagem"))
    except requests.RequestException as e:
        respostas["imagem do mapa"] = type(e).__name__

    resultados.insert(0, avaliar_site(respostas, municipios_no_sitemap))

    # O endereço do script de métricas sai do JS que a página inicial carrega.
    try:
        inicio = requests.get(SITE_PUBLICADO, timeout=30).text
        scripts = sorted(set(re.findall(r'<script[^>]+src="([^"]+\.js)"', inicio)))[:40]
        textos = [requests.get(s if s.startswith("http") else SITE_PUBLICADO + s, timeout=30).text for s in scripts]
        endereco, origem = endereco_script_analytics(textos)
        status = None
        if endereco:
            status = _status(endereco if endereco.startswith("http") else SITE_PUBLICADO + endereco)
        resultados.append(avaliar_analytics(endereco, origem, status))
    except requests.RequestException as e:
        resultados.append(Resultado("Vercel Analytics", "atencao", f"não deu pra verificar: {type(e).__name__}"))
    return resultados


def _coletar_fonte_inpe(agora: datetime) -> Resultado:
    from email.utils import parsedate_to_datetime

    from pipeline.ingest.inpe import URL_FOCOS_MENSAL_BR

    try:
        resposta = requests.head(URL_FOCOS_MENSAL_BR.format(ano=agora.year, mes=agora.month, ext="csv"), timeout=30)
        cabecalho = resposta.headers.get("last-modified") if resposta.ok else None
        return avaliar_fonte_inpe(parsedate_to_datetime(cabecalho) if cabecalho else None, agora)
    except (requests.RequestException, TypeError, ValueError):
        return avaliar_fonte_inpe(None, agora)


def _coletar(agora: datetime) -> list[Resultado]:
    resultados = []
    for nome, coleta in (
        ("Banco de dados", lambda: _coletar_banco(agora)),
        ("Execuções do pipeline na main (últimas 26 h)", lambda: [_coletar_execucoes(agora)]),
        ("Site publicado", _coletar_site),
        ("Arquivo do INPE do mês (fonte)", lambda: [_coletar_fonte_inpe(agora)]),
    ):
        try:
            resultados.extend(coleta())
        except Exception as e:  # uma coleta quebrada vira falha, não derruba as outras
            resultados.append(Resultado(nome, "falha", f"não deu pra verificar: {type(e).__name__}: {e}"))
    return resultados


# --- saída ---


def _escapar(texto: str, propriedade: bool = False) -> str:
    texto = texto.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return texto.replace(":", "%3A").replace(",", "%2C") if propriedade else texto


def imprimir(resultados: list[Resultado]) -> None:
    comando = {"ok": "notice", "atencao": "warning", "falha": "error"}
    for r in resultados:
        print(f"{_ICONE[r.nivel]} {r.nome}: {r.detalhe}")
        print(f"::{comando[r.nivel]} title={_escapar(r.nome, True)}::{_escapar(r.detalhe)}")
    resumo = os.environ.get("GITHUB_STEP_SUMMARY")
    if resumo:
        with open(resumo, "a", encoding="utf-8") as f:
            f.write("## Verificação diária de saúde\n\n" + tabela_markdown(resultados) + "\n")


def alertar(resultados: list[Resultado]) -> str:
    repositorio = os.environ["GITHUB_REPOSITORY"]
    api = f"https://api.github.com/repos/{repositorio}"
    cabecalhos = _cabecalhos_github()
    url_execucao = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{repositorio}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"

    abertas = requests.get(
        f"{api}/issues",
        params={"state": "open", "creator": "github-actions[bot]", "per_page": 50},
        headers=cabecalhos,
        timeout=30,
    )
    abertas.raise_for_status()
    issue = next((i for i in abertas.json() if i["title"].startswith(TITULO_ISSUE) and "pull_request" not in i), None)

    chave_anterior = None
    if issue:
        comentarios = requests.get(issue["comments_url"], params={"per_page": 100}, headers=cabecalhos, timeout=30)
        comentarios.raise_for_status()
        chave_anterior = ultima_marca([issue.get("body") or ""] + [c.get("body") or "" for c in comentarios.json()])

    chave = chave_das_falhas(resultados)
    acao = decidir_acao(chave, issue is not None, chave_anterior)
    corpo = corpo_do_alerta(resultados, url_execucao, os.environ.get("ALERTA_MENCAO"))
    if acao == "abrir":
        titulo = f"{TITULO_ISSUE}: " + ", ".join(r.nome for r in resultados if r.nivel == "falha")
        requests.post(f"{api}/issues", json={"title": titulo[:250], "body": corpo}, headers=cabecalhos, timeout=30).raise_for_status()
    elif acao == "comentar":
        requests.post(issue["comments_url"], json={"body": corpo}, headers=cabecalhos, timeout=30).raise_for_status()
    elif acao == "fechar":
        fim = f"Tudo normal de novo ({datetime.now(timezone.utc):%d/%m/%Y %H:%M} UTC): {url_execucao}\n\n<!-- falhas:  -->"
        requests.post(issue["comments_url"], json={"body": fim}, headers=cabecalhos, timeout=30).raise_for_status()
        requests.patch(issue["url"], json={"state": "closed", "state_reason": "completed"}, headers=cabecalhos, timeout=30).raise_for_status()
    return acao


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alertar", action="store_true", help="Abre/comenta/fecha a issue de alerta no GitHub")
    args = parser.parse_args()

    agora = datetime.now(timezone.utc)
    resultados = _coletar(agora)
    imprimir(resultados)

    if args.alertar:
        for tentativa in range(3):
            try:
                print(f"Issue de alerta: {alertar(resultados)}")
                break
            except requests.RequestException as e:
                print(f"[AVISO] não deu pra atualizar a issue de alerta ({type(e).__name__}: {e})")
                time.sleep(5 * (tentativa + 1))

    if any(r.nivel == "falha" for r in resultados):
        sys.exit(1)


if __name__ == "__main__":
    main()
