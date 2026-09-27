"""CLI: mosaico estadual da leitura de satélite (dNBR) por mês → R2 + banco.

    python -m pipeline.run_dnbr_estado                  # último mês completo (cron mensal)
    python -m pipeline.run_dnbr_estado --mes 2024-08    # um mês
    python -m pipeline.run_dnbr_estado --ano 2024       # os meses já fechados do ano

O mapa do estado inteiro do site (docs/DECISIONS.md seção 6.55, pedido do
Pedro: "um mapa de todo o estado de São Paulo com os dNBR mensais de todos
os municípios", com os limites municipais liga/desliga, pra comparar com o
mapa de confiabilidade). Mesmo cálculo das miniaturas municipais
(dnbr/sentinel2.py::calcular_dnbr: mediana do Sentinel-2 do mês anterior
contra a do mês alvo, NBR com B8/B12, fallback de nuvem, cobertura mínima de
50%) e a mesma paleta (VIS_PARAMS, 0,10 → 0,70), numa imagem só do estado
recortada pelo contorno de SP. É visualização, em ~380 m por pixel: os
números de cada município continuam vindo do cálculo em 20 m (run_dnbr.py).

A imagem cobre exatamente o retângulo do viewBox do mapa do site
(`limites` de geodata/sp_contorno.geojson, gerado junto com
webapp/public/mapa/sp.json), com a mesma proporção largura/altura, então o
site só estica a imagem sobre o desenho — sem reprojetar nada.

Meses sem Sentinel-2 com correção atmosférica no Brasil (antes de dez/2018)
usam a coleção sem correção (L1C) — anotado na linha do banco.

Saída: `dnbr-estado/AAAA-MM.webp` no R2 (WebP com transparência fora de SP
e onde não houve imagem válida; ~10x menor que o PNG do Earth Engine) e uma
linha em `mosaicos_dnbr` (criada aqui se não existir, como as outras
migrações idempotentes do pipeline).
"""

import argparse
import json
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path

from pipeline.common.db import get_connection

CONTORNO_SP = Path(__file__).resolve().parent.parent / "geodata" / "sp_contorno.geojson"
# Mesma proporção do viewBox do site (1000 × 669): pixel quadrado na tela.
LARGURA_PX = 2400
LARGURAS_RESERVA_PX = (1800, 1200)  # se o Earth Engine recusar o tamanho
QUALIDADE_WEBP = 82
PRIMEIRO_MES = (2018, 1)


def limites_e_proporcao(contorno: dict) -> tuple[list[float], float]:
    """([oeste, sul, leste, norte], altura/largura do viewBox do site)."""
    import math

    oeste, sul, leste, norte = contorno["properties"]["limites"]
    fator_lon = math.cos(math.radians((sul + norte) / 2))
    return [oeste, sul, leste, norte], (norte - sul) / ((leste - oeste) * fator_lon)


def dimensoes(largura: int, proporcao: float) -> tuple[int, int]:
    return largura, round(largura * proporcao)


def mes_anterior(ano: int, mes: int) -> tuple[int, int]:
    return (ano - 1, 12) if mes == 1 else (ano, mes - 1)


def ultimo_mes_completo(hoje: date) -> tuple[int, int]:
    return mes_anterior(hoje.year, hoje.month)


def meses_fechados_do_ano(ano: int, hoje: date) -> list[tuple[int, int]]:
    """Meses do ano que já terminaram (e não antes do primeiro mês do
    histórico)."""
    limite = ultimo_mes_completo(hoje)
    return [(ano, m) for m in range(1, 13) if PRIMEIRO_MES <= (ano, m) <= limite]


def ler_mes(texto: str) -> tuple[int, int]:
    ano, mes = texto.split("-")
    if not 1 <= int(mes) <= 12:
        raise argparse.ArgumentTypeError(f"mês inválido: {texto}")
    return int(ano), int(mes)


def chave_r2(ano: int, mes: int) -> str:
    return f"dnbr-estado/{ano}-{mes:02d}.webp"


def png_para_webp(png: bytes, qualidade: int = QUALIDADE_WEBP) -> bytes:
    from PIL import Image

    imagem = Image.open(BytesIO(png)).convert("RGBA")
    saida = BytesIO()
    imagem.save(saida, format="WEBP", quality=qualidade, method=6)
    return saida.getvalue()


# Cores da paleta (VIS_PARAMS: green, yellow, orange, red, black) pra resumir
# a imagem no log — o sandbox do Claude Code não alcança o R2 pra olhar.
_CORES_PALETA = {"verde": (0, 128, 0), "amarelo": (255, 255, 0), "laranja": (255, 165, 0), "vermelho": (255, 0, 0), "preto": (0, 0, 0)}
_SIMBOLOS = {"verde": ".", "amarelo": "+", "laranja": "*", "vermelho": "#", "preto": "@"}


def _cor_mais_proxima(rgb: tuple[int, int, int]) -> str:
    return min(_CORES_PALETA, key=lambda nome: sum((a - b) ** 2 for a, b in zip(rgb, _CORES_PALETA[nome])))


def resumo_png(png: bytes, colunas: int = 90) -> tuple[str, str]:
    """(percentuais por cor sobre os pixels com imagem, desenho em texto da
    imagem reduzida) — confere recorte, cobertura e cores sem abrir o PNG."""
    from PIL import Image

    imagem = Image.open(BytesIO(png)).convert("RGBA")
    contagem = {nome: 0 for nome in _CORES_PALETA}
    opacos = 0
    reduzida = imagem.resize((imagem.width // 8, imagem.height // 8), Image.NEAREST)
    pixels = reduzida.get_flattened_data() if hasattr(reduzida, "get_flattened_data") else reduzida.getdata()
    for r, g, b, a in pixels:
        if a < 128:
            continue
        opacos += 1
        contagem[_cor_mais_proxima((r, g, b))] += 1
    total = max(1, opacos)
    percentuais = " | ".join(f"{nome} {100 * n / total:.1f}%" for nome, n in contagem.items())
    percentuais += f" | com imagem {100 * opacos / (reduzida.width * reduzida.height):.1f}% do retângulo"

    linhas = max(1, round(colunas * imagem.height / imagem.width / 2))
    mini = imagem.resize((colunas, linhas), Image.NEAREST)
    desenho = "\n".join(
        "".join(" " if a < 128 else _SIMBOLOS[_cor_mais_proxima((r, g, b))] for r, g, b, a in
                (mini.getpixel((x, y)) for x in range(colunas)))
        for y in range(linhas)
    )
    return percentuais, desenho


def _garantir_tabela(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS mosaicos_dnbr (
                ano             SMALLINT NOT NULL,
                mes             SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
                imagem_url      TEXT NOT NULL,
                oeste           DOUBLE PRECISION NOT NULL,
                sul             DOUBLE PRECISION NOT NULL,
                leste           DOUBLE PRECISION NOT NULL,
                norte           DOUBLE PRECISION NOT NULL,
                largura_px      INT NOT NULL,
                altura_px       INT NOT NULL,
                colecao         TEXT NOT NULL,
                n_cenas_antes   INT,
                n_cenas_depois  INT,
                limite_nuvem    SMALLINT,
                cobertura_pct   NUMERIC(5, 1),
                gerado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (ano, mes)
            )
            """
        )


def _ja_existe(conn, ano: int, mes: int) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM mosaicos_dnbr WHERE ano = %(ano)s AND mes = %(mes)s", {"ano": ano, "mes": mes})
        return cur.fetchone() is not None


def _gravar(conn, linha: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO mosaicos_dnbr
                (ano, mes, imagem_url, oeste, sul, leste, norte, largura_px, altura_px,
                 colecao, n_cenas_antes, n_cenas_depois, limite_nuvem, cobertura_pct)
            VALUES (%(ano)s, %(mes)s, %(imagem_url)s, %(oeste)s, %(sul)s, %(leste)s, %(norte)s,
                    %(largura_px)s, %(altura_px)s, %(colecao)s, %(n_cenas_antes)s, %(n_cenas_depois)s,
                    %(limite_nuvem)s, %(cobertura_pct)s)
            ON CONFLICT (ano, mes) DO UPDATE SET
                imagem_url = EXCLUDED.imagem_url,
                oeste = EXCLUDED.oeste, sul = EXCLUDED.sul, leste = EXCLUDED.leste, norte = EXCLUDED.norte,
                largura_px = EXCLUDED.largura_px, altura_px = EXCLUDED.altura_px,
                colecao = EXCLUDED.colecao,
                n_cenas_antes = EXCLUDED.n_cenas_antes, n_cenas_depois = EXCLUDED.n_cenas_depois,
                limite_nuvem = EXCLUDED.limite_nuvem, cobertura_pct = EXCLUDED.cobertura_pct,
                gerado_em = now()
            """,
            linha,
        )


def gerar_mes(ano: int, mes: int, contorno: dict) -> dict | None:
    """Calcula, renderiza e sobe o mosaico de um mês. None se nenhuma
    combinação de cenas cobriu o estado (nuvem demais, ou sem Sentinel-2)."""
    import ee
    import requests

    from pipeline.dnbr.sentinel2 import COLECAO_L1C, COLECAO_SR, VIS_PARAMS, SemImagemValida, calcular_dnbr
    from pipeline.run_dnbr import janela_mes_especifico, subir_r2

    limites, proporcao = limites_e_proporcao(contorno)
    # geodesic=False: arestas retas em lon/lat, como o desenho do site.
    estado = ee.Geometry(contorno["geometry"], None, False)
    retangulo = ee.Geometry.Rectangle(limites, proj="EPSG:4326", geodesic=False)
    janela_antes, janela_depois = janela_mes_especifico(ano, mes)

    resultado, colecao = None, None
    for colecao in (COLECAO_SR, COLECAO_L1C):
        try:
            resultado = calcular_dnbr(estado, janela_antes, janela_depois, colecao=colecao)
            break
        except SemImagemValida as e:
            print(f"[AVISO] {ano}-{mes:02d} sem imagem válida em {colecao}: {e}")
    if resultado is None:
        return None

    colorido = resultado.imagem.visualize(**VIS_PARAMS).clip(estado)
    png, largura, altura = None, 0, 0
    for tentativa in (LARGURA_PX, *LARGURAS_RESERVA_PX):
        largura, altura = dimensoes(tentativa, proporcao)
        try:
            url = colorido.getThumbURL(
                {"region": retangulo, "dimensions": f"{largura}x{altura}", "format": "png", "crs": "EPSG:4326"}
            )
            resposta = requests.get(url, timeout=600)
            resposta.raise_for_status()
            png = resposta.content
            break
        except Exception as e:  # tamanho ou tempo de cálculo recusado: tenta menor
            print(f"[AVISO] {ano}-{mes:02d} em {largura}x{altura} falhou: {type(e).__name__}: {e}")
    if png is None:
        raise RuntimeError(f"{ano}-{mes:02d}: o Earth Engine recusou todos os tamanhos")

    percentuais, desenho = resumo_png(png)
    print(f"{ano}-{mes:02d} cores: {percentuais}")
    print(desenho)
    webp = png_para_webp(png)
    imagem_url = subir_r2(webp, chave_r2(ano, mes), "image/webp")
    if imagem_url is None:
        raise RuntimeError("R2 não configurado (R2_* ausentes) — o mosaico não tem onde ficar")
    print(f"{ano}-{mes:02d}: {len(png) // 1024} KB em PNG -> {len(webp) // 1024} KB em WebP, {largura}x{altura}, {colecao}")

    oeste, sul, leste, norte = limites
    return {
        "ano": ano,
        "mes": mes,
        "imagem_url": imagem_url,
        "oeste": oeste,
        "sul": sul,
        "leste": leste,
        "norte": norte,
        "largura_px": largura,
        "altura_px": altura,
        "colecao": colecao,
        "n_cenas_antes": resultado.n_cenas_antes,
        "n_cenas_depois": resultado.n_cenas_depois,
        "limite_nuvem": resultado.limite_nuvem_usado,
        "cobertura_pct": round(resultado.cobertura_pct, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--mes", type=ler_mes, help="AAAA-MM")
    grupo.add_argument("--ano", type=int, help="Todos os meses já fechados do ano")
    parser.add_argument("--forcar", action="store_true", help="Refaz meses que já têm mosaico")
    args = parser.parse_args()

    hoje = date.today()
    if args.mes:
        meses = [args.mes]
    elif args.ano:
        meses = meses_fechados_do_ano(args.ano, hoje)
    else:
        meses = [ultimo_mes_completo(hoje)]

    from pipeline.run_dnbr import inicializar_gee

    inicializar_gee()
    contorno = json.loads(CONTORNO_SP.read_text(encoding="utf-8"))

    with get_connection() as conn:
        _garantir_tabela(conn)

    feitos, pulados, sem_imagem, erros = 0, 0, 0, 0
    for ano, mes in meses:
        with get_connection() as conn:
            if not args.forcar and _ja_existe(conn, ano, mes):
                pulados += 1
                print(f"{ano}-{mes:02d}: já existe, pulando (use --forcar pra refazer)")
                continue
        try:
            linha = gerar_mes(ano, mes, contorno)
        except Exception as e:
            erros += 1
            print(f"[ERRO] {ano}-{mes:02d}: {type(e).__name__}: {e}")
            continue
        if linha is None:
            sem_imagem += 1
            continue
        with get_connection() as conn:
            _gravar(conn, linha)
        feitos += 1

    resumo = f"feitos={feitos} | ja existiam={pulados} | sem imagem valida={sem_imagem} | erros={erros}"
    print(f"::notice title=Mosaico dNBR {meses[0][0]}-{meses[0][1]:02d} a {meses[-1][0]}-{meses[-1][1]:02d}::{resumo}")
    if erros and not feitos:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
