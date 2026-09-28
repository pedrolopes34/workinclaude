"""Diagnóstico (e correção opcional) das URLs de miniatura dNBR no R2.

    python -m pipeline.diagnosticar_imagens_r2             # só lê, não muda nada
    python -m pipeline.diagnosticar_imagens_r2 --corrigir  # reescreve URLs gravadas

Criado pra resolver de vez o mapa quebrado no site (docs/DECISIONS.md seção
6.48/6.49). O sandbox do Claude Code não alcança Neon, R2 nem o site
publicado; o runner do GitHub Actions alcança os três — por isso isto roda
lá (`diagnostico-imagens-r2.yml`) e imprime tudo que importa num só log:

1. a forma do secret R2_PUBLIC_URL_BASE (sem imprimir credencial);
2. o que está de fato gravado no banco (metricas_anuais e
   consultas_sob_demanda): quantas URLs, com que host;
3. o que existe de fato no bucket (chaves reais);
4. se a URL gravada e a URL "base atual + chave" respondem da internet;
5. o que o site publicado renderiza no `src` da imagem — e quantos meses do
   mapa do estado (mosaicos, `dnbr-estado/`) o /mapa entrega, contra o banco.

`--corrigir` reescreve cada URL gravada como `base atual + chave do objeto`,
mas só depois de confirmar que essa combinação responde 200 com imagem de
verdade — nunca troca uma URL quebrada por outra quebrada.
"""

import argparse
import os
import re
import time
from collections import Counter
from urllib.parse import urlparse

import requests
from psycopg import sql

from pipeline.common.db import get_connection
from pipeline.run_dnbr import _diagnostico_seguro, _endpoint_r2, _env_r2

SITE_PUBLICADO = "https://workinclaude.vercel.app"
MUNICIPIOS_AMOSTRA = {"3500105": "Adamantina", "3533908": "Olímpia", "3539509": "Pitangueiras"}
TABELAS_COM_IMAGEM = ("metricas_anuais", "consultas_sob_demanda")
# Mosaicos do estado (run_dnbr_estado.py::chave_r2): `dnbr-estado/AAAA-MM.webp`.
PADRAO_MES_MOSAICO = re.compile(r"dnbr-estado/(\d{4}-\d{2})\.webp")
PADRAO_URL_MOSAICO = re.compile(r"https?://[^\"'\\\s]+?/dnbr-estado/\d{4}-\d{2}\.webp")


def categoria_host(url: str) -> str:
    host = urlparse(url).hostname or ""
    if host.endswith(".r2.dev"):
        return "r2.dev (URL pública)"
    if host.endswith(".r2.cloudflarestorage.com"):
        return "r2.cloudflarestorage.com (endpoint S3 — privado, exige assinatura)"
    return f"outro ({host or 'sem host'})"


def chave_do_objeto(url: str) -> str | None:
    """Chave do objeto no bucket (`dnbr/<arquivo>.png`) a partir de qualquer URL
    gravada — independe da base usada pra montá-la, porque a chave sempre foi
    `dnbr/{codigo}-{ano}-{mes}.png` (run_dnbr.py::_subir_miniatura_r2)."""
    i = url.rfind("/dnbr/")
    return url[i + 1 :] if i != -1 else None


def testar_http(url: str) -> tuple[bool, str]:
    """(é imagem respondendo 200?, descrição curta pro log)."""
    try:
        resposta = requests.get(url, timeout=30)
    except Exception as e:
        return False, f"FALHOU: {type(e).__name__}"
    tipo = resposta.headers.get("content-type", "?")
    ok = resposta.status_code == 200 and tipo.startswith("image/")
    return ok, f"HTTP {resposta.status_code} | {tipo} | {len(resposta.content)} bytes"


def meses_de_mosaico_na_pagina(html: str) -> list[str]:
    """Meses ("AAAA-MM") de mosaico do estado que a página publicada entrega ao
    navegador. As URLs vão no payload do React Server Components, dentro de
    strings com aspas escapadas — por isso a busca é pelo trecho da chave, não
    por JSON."""
    return sorted(set(PADRAO_MES_MOSAICO.findall(html)))


def url_de_mosaico_na_pagina(html: str) -> str | None:
    achado = PADRAO_URL_MOSAICO.search(html)
    return achado.group(0) if achado else None


def _tabela_existe(cur, tabela: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (tabela,))
    return cur.fetchone()[0] is not None


def _urls_gravadas(conn, tabela: str) -> list[tuple[int, str]]:
    with conn.cursor() as cur:
        if not _tabela_existe(cur, tabela):
            return []
        cur.execute(
            sql.SQL("SELECT id, dnbr_imagem_url FROM {} WHERE dnbr_imagem_url IS NOT NULL").format(
                sql.Identifier(tabela)
            )
        )
        return cur.fetchall()


def _cliente_r2():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=_endpoint_r2(_env_r2("R2_ACCOUNT_ID")),
        aws_access_key_id=_env_r2("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_env_r2("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def _chaves_no_bucket() -> set[str]:
    cliente = _cliente_r2()
    chaves = set()
    for pagina in cliente.get_paginator("list_objects_v2").paginate(Bucket=_env_r2("R2_BUCKET_NAME")):
        chaves.update(obj["Key"] for obj in pagina.get("Contents", []))
    return chaves


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corrigir", action="store_true")
    args = parser.parse_args()

    print("=== 1. Secret R2_PUBLIC_URL_BASE ===")
    base = os.environ.get("R2_PUBLIC_URL_BASE", "").strip().rstrip("/")
    if not base:
        raise SystemExit("R2_PUBLIC_URL_BASE vazio ou ausente — nada a diagnosticar.")
    host_base = urlparse(base).hostname or ""
    print(_diagnostico_seguro("R2_PUBLIC_URL_BASE", base))
    print(f"host={host_base} | categoria={categoria_host(base)} | caminho_extra={urlparse(base).path!r}")

    print("\n=== 2. Objetos que existem de fato no bucket ===")
    try:
        chaves = _chaves_no_bucket()
    except Exception as e:
        # Segue sem a listagem — o resto do diagnóstico (banco, HTTP, site)
        # continua útil mesmo se as credenciais de escrita do R2 falharem.
        print(f"FALHOU ao listar o bucket: {type(e).__name__}: {e}")
        chaves = set()
    chaves_dnbr = sorted(k for k in chaves if k.startswith("dnbr/"))
    chaves_estado = sorted(k for k in chaves if k.startswith("dnbr-estado/"))
    print(
        f"total de objetos: {len(chaves)} | com prefixo dnbr/: {len(chaves_dnbr)}"
        f" | com prefixo dnbr-estado/: {len(chaves_estado)}"
    )
    print(f"exemplos: {chaves_dnbr[:3]} ... {chaves_dnbr[-3:]}")
    outras = sorted(chaves - set(chaves_dnbr) - set(chaves_estado))[:5]
    if outras:
        print(f"objetos FORA de dnbr/ e dnbr-estado/ (inesperado): {outras}")

    print("\n=== 3. URLs gravadas no banco ===")
    with get_connection() as conn:
        gravadas = {tabela: _urls_gravadas(conn, tabela) for tabela in TABELAS_COM_IMAGEM}
    for tabela, linhas in gravadas.items():
        resumo = Counter(
            (categoria_host(url), (urlparse(url).hostname or "") == host_base, chave_do_objeto(url) in chaves)
            for _, url in linhas
        )
        print(f"{tabela}: {len(linhas)} URL(s)")
        for (categoria, mesmo_host, objeto_existe), n in resumo.most_common():
            print(f"  {n:>4}x  host={categoria} | mesmo host da base atual={mesmo_host} | objeto existe no bucket={objeto_existe}")

    print("\n=== 4. Teste HTTP real (a partir da internet) ===")
    with get_connection() as conn, conn.cursor() as cur:
        for codigo, nome in MUNICIPIOS_AMOSTRA.items():
            cur.execute(
                "SELECT ano, dnbr_imagem_url FROM metricas_anuais "
                "WHERE codigo_ibge = %s AND dnbr_imagem_url IS NOT NULL ORDER BY ano DESC LIMIT 1",
                (codigo,),
            )
            linha = cur.fetchone()
            if linha is None:
                print(f"{nome} ({codigo}): sem URL gravada")
                continue
            ano, url = linha
            chave = chave_do_objeto(url)
            print(f"{nome} ({codigo}), ano {ano}: chave={chave} | objeto existe={chave in chaves}")
            print(f"  URL gravada ({categoria_host(url)}, caminho={urlparse(url).path}): {testar_http(url)[1]}")
            if chave:
                print(f"  base atual + chave: {testar_http(f'{base}/{chave}')[1]}")

    print("\n=== 5. O que o site publicado renderiza ===")
    for codigo, nome in MUNICIPIOS_AMOSTRA.items():
        try:
            pagina = requests.get(f"{SITE_PUBLICADO}/municipio/{codigo}", timeout=30)
        except Exception as e:
            print(f"{nome}: FALHOU ao abrir a página: {type(e).__name__}")
            continue
        srcs = [s for s in re.findall(r'<img[^>]+src="([^"]+)"', pagina.text) if "dnbr" in s]
        print(f"{nome}: página HTTP {pagina.status_code} | src(s) de mapa: {len(srcs)}")
        for src in srcs[:1]:
            print(f"  src host={categoria_host(src)} | caminho={urlparse(src).path} | {testar_http(src)[1]}")

    # Mapa estadual (docs/DECISIONS.md seção 6.54): a página vem do servidor e
    # a geometria é um arquivo estático baixado pelo navegador.
    for caminho in ("/mapa", "/mapa/sp.json", "/mapa/sp-leve.json"):
        try:
            resposta = requests.get(f"{SITE_PUBLICADO}{caminho}", timeout=30)
        except Exception as e:
            print(f"{caminho}: FALHOU: {type(e).__name__}")
            continue
        detalhe = ""
        if caminho.endswith(".json") and resposta.ok:
            try:
                corpo = resposta.json()
                detalhe = f" | municípios={len(corpo.get('municipios', {}))} áreas={len(corpo.get('areas_km2', {}))}"
            except ValueError:
                detalhe = " | NÃO é JSON"
        print(f"{caminho}: HTTP {resposta.status_code} | {resposta.headers.get('content-type', '?')} | {len(resposta.content)} bytes{detalhe}")

    # Mapa do estado mês a mês (docs/DECISIONS.md seção 6.55). O /mapa é
    # regenerado no máximo a cada hora (revalidate = 3600): a primeira visita
    # depois disso ainda recebe a versão guardada e dispara a nova — por isso
    # a segunda tentativa quando a página vem com menos meses que o banco.
    print("\n=== 5b. Mapa do estado mês a mês (mosaicos) ===")
    with get_connection() as conn, conn.cursor() as cur:
        no_banco = 0
        if _tabela_existe(cur, "mosaicos_dnbr"):
            cur.execute("SELECT count(*) FROM mosaicos_dnbr")
            no_banco = cur.fetchone()[0]
    print(f"no banco: {no_banco} meses | no bucket: {len(chaves_estado)} objetos em dnbr-estado/")
    html_mapa = ""
    for tentativa in (1, 2):
        try:
            resposta = requests.get(f"{SITE_PUBLICADO}/mapa", timeout=30)
        except Exception as e:
            print(f"/mapa (tentativa {tentativa}): FALHOU: {type(e).__name__}")
            continue
        html_mapa = resposta.text
        meses = meses_de_mosaico_na_pagina(html_mapa)
        faixa = f" | de {meses[0]} a {meses[-1]}" if meses else ""
        print(f"/mapa (tentativa {tentativa}): HTTP {resposta.status_code} | {len(meses)} meses na página{faixa}")
        if len(meses) >= no_banco:
            break
        time.sleep(20)
    url_exemplo = url_de_mosaico_na_pagina(html_mapa)
    if url_exemplo:
        print(f"imagem de exemplo ({urlparse(url_exemplo).path}): {testar_http(url_exemplo)[1]}")
    try:
        inicio = requests.get(SITE_PUBLICADO, timeout=30)
        contagem = re.search(r"(\d+) meses no mapa", inicio.text)
        print(f"/: HTTP {inicio.status_code} | texto da página inicial: {contagem.group(0) if contagem else 'sem contagem de meses'}")
    except Exception as e:
        print(f"/: FALHOU: {type(e).__name__}")

    if not args.corrigir:
        print("\n(modo só leitura — rode com --corrigir pra reescrever as URLs gravadas)")
        return

    print("\n=== 6. Correção ===")
    amostra = next((k for k in chaves_dnbr), None)
    if amostra is None:
        raise SystemExit("Nenhum objeto em dnbr/ no bucket — nada pra apontar. Correção abortada.")
    ok, descricao = testar_http(f"{base}/{amostra}")
    print(f"guarda: base atual + {amostra} -> {descricao}")
    if not ok:
        raise SystemExit(
            "A base atual NÃO serve imagem de verdade — reescrever as URLs não resolveria. "
            "Correção abortada sem tocar no banco."
        )

    with get_connection() as conn, conn.cursor() as cur:
        for tabela, linhas in gravadas.items():
            contagem = Counter()
            for id_linha, url in linhas:
                chave = chave_do_objeto(url)
                if chave is None:
                    contagem["pulada: URL sem /dnbr/"] += 1
                    continue
                if chave not in chaves:
                    contagem["pulada: objeto não existe no bucket"] += 1
                    continue
                nova = f"{base}/{chave}"
                if nova == url:
                    contagem["já estava certa"] += 1
                    continue
                cur.execute(
                    sql.SQL("UPDATE {} SET dnbr_imagem_url = %s WHERE id = %s").format(sql.Identifier(tabela)),
                    (nova, id_linha),
                )
                contagem["corrigida"] += 1
            print(f"{tabela}: {dict(contagem)}")
    print("Correção gravada (commit feito).")


if __name__ == "__main__":
    main()
