"""CLI: calcula dNBR via Sentinel-2/GEE pra um grupo de municípios, grava
`area_dnbr_km2` em metricas_anuais.

    python -m pipeline.run_dnbr --grupo 1 --de-grupos 2

Pensado pra rodar mensalmente, dividido em jobs paralelos
(`process-sentinel-dnbr.yml`, docs/DECISIONS.md seção 2.1) — `--grupo`/
`--de-grupos` particiona os municípios (ordenados por codigo_ibge) em N
fatias aproximadamente iguais, uma por job. `--municipio` testa 1 código
IBGE só, minutos em vez de ~2h (docs/DECISIONS.md seção 6.41, mesmo padrão
de run_validacao_mapbiomas.py seção 6.30).

Compara Sentinel-2 do mês anterior ("antes") contra o mês corrente
("depois") — generalização mensal contínua do método de pesquisa (que
comparava julho/setembro em torno do evento de agosto/2024, pulando o
próprio mês do evento). Uma cadência mensal contínua não tem um "mês do
evento" fixo pra pular no meio; comparar mês a mês direto é a extensão mais
direta, mas é uma decisão nova, não extraída de nenhum notebook — ver
docs/DECISIONS.md seção 6.14.

`area_dnbr_km2` = área com dNBR acima do menor limiar de evidência
espectral (0,10 — "fraca" em diante, pipeline/dnbr/constants.py), calculada
diretamente no servidor do Earth Engine via `reduceRegion` (síncrono — não
depende de exportar/baixar GeoTIFF do Drive, ao contrário dos notebooks
originais).

Também gera `dnbr_imagem_url`: uma miniatura PNG colorida (docs/DECISIONS.md
seção 6.40, pedido do Pedro pra ter mapa real em todos os 645 municípios,
não só Pitangueiras) — reaproveita `dnbr/sentinel2.py::preparar_exportacao`
(já existia, nunca tinha sido chamado em produção) pra pegar a imagem já
colorida (`ee.Image.visualize`), usa `getThumbURL` do próprio GEE pra
renderizar (sem exportar GeoTIFF completo — muito mais barato de quota e de
armazenamento) e sobe o PNG resultante pro Cloudflare R2. Se `R2_*` não
estiver configurado (ainda não é o caso em produção — ver seção 6.40),
`dnbr_imagem_url` fica None e a linha grava normalmente sem miniatura; a
imagem nunca bloqueia a gravação de `area_dnbr_km2`, que é o dado principal.

NÃO EXECUTÁVEL/TESTÁVEL nesta sessão — precisa de rede e credenciais do
Earth Engine indisponíveis neste sandbox de propósito (mesma limitação de
`dnbr/sentinel2.py`), e depende de secrets do R2 que ainda não existem
(seção 6.40 — pendência do Pedro criar a conta/bucket). `janela_mes_anterior`
(lógica pura, sem GEE) tem testes em tests/pipeline/test_run_dnbr.py;
`dividir_em_grupo` mudou pra pipeline/common/particionamento.py (reaproveitado
também por run_validacao_mapbiomas.py) e é testado lá.
"""

import argparse
import json
import os
from datetime import date, timedelta
from io import BytesIO

import pandas as pd

from pipeline.common.db import get_connection
from pipeline.common.particionamento import dividir_em_grupo
from pipeline.dnbr.constants import LIMIARES_SEVERIDADE

GEE_PROJECT_ID = "concrete-bloom-374223"
LIMIAR_AREA_QUEIMADA = LIMIARES_SEVERIDADE[0]
DIMENSAO_MINIATURA_PX = 800  # lado maior, PNG leve (~100-300KB) — mapa de card, nao analise pericial


def _r2_configurado() -> bool:
    return bool(os.environ.get("R2_ACCESS_KEY_ID"))


def _env_r2(nome: str) -> str:
    """Le um secret R2_* e tira espaco/quebra de linha acidental (armadilha
    comum de copiar-colar de uma UI web — docs/DECISIONS.md secao 6.41)."""
    return os.environ[nome].strip()


def _endpoint_r2(account_id: str) -> str:
    """Normaliza R2_ACCOUNT_ID pra so' o ID puro, mesmo se alguem colar sem
    querer a URL do endpoint inteira (que a propria Cloudflare mostra em
    outras telas) em vez de so' o account id — achado real na primeira
    tentativa desta sessao (docs/DECISIONS.md secao 6.41): boto3 rejeitava
    com "Invalid endpoint" porque o valor colado ja' vinha com
    "https://...r2.cloudflarestorage.com" dentro, virando um endpoint
    duplicado/malformado."""
    account_id = account_id.removeprefix("https://").removeprefix("http://")
    account_id = account_id.removesuffix("/").removesuffix(".r2.cloudflarestorage.com")
    return f"https://{account_id}.r2.cloudflarestorage.com"


def _subir_miniatura_r2(png_bytes: bytes, codigo_ibge: str, ano: int, mes: int) -> str | None:
    """Sobe o PNG pro Cloudflare R2 (API compativel com S3, boto3) e devolve
    a URL publica — None se os secrets R2_* nao estiverem configurados
    (docs/DECISIONS.md secao 6.40), pra nunca quebrar a rodada por causa da
    miniatura opcional."""
    if not _r2_configurado():
        return None

    import boto3

    caminho = f"dnbr/{codigo_ibge}-{ano}-{mes:02d}.png"
    cliente = boto3.client(
        "s3",
        endpoint_url=_endpoint_r2(_env_r2("R2_ACCOUNT_ID")),
        aws_access_key_id=_env_r2("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_env_r2("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )
    cliente.upload_fileobj(
        BytesIO(png_bytes),
        _env_r2("R2_BUCKET_NAME"),
        caminho,
        ExtraArgs={"ContentType": "image/png"},
    )
    return f"{_env_r2('R2_PUBLIC_URL_BASE').rstrip('/')}/{caminho}"


def inicializar_gee() -> None:
    import ee

    chave_json = os.environ["GEE_SERVICE_ACCOUNT_KEY"]
    credenciais_dict = json.loads(chave_json)
    credenciais = ee.ServiceAccountCredentials(credenciais_dict["client_email"], key_data=chave_json)
    ee.Initialize(credenciais, project=os.environ.get("GEE_PROJECT_ID", GEE_PROJECT_ID))


def janela_mes_anterior(hoje: date) -> tuple[tuple[str, str], tuple[str, str]]:
    """(janela "antes" = mês anterior inteiro, janela "depois" = mês
    corrente até hoje)."""
    primeiro_dia_mes_atual = hoje.replace(day=1)
    ultimo_dia_mes_anterior = primeiro_dia_mes_atual - timedelta(days=1)
    primeiro_dia_mes_anterior = ultimo_dia_mes_anterior.replace(day=1)

    janela_antes = (primeiro_dia_mes_anterior.isoformat(), primeiro_dia_mes_atual.isoformat())
    janela_depois = (primeiro_dia_mes_atual.isoformat(), hoje.isoformat())
    return janela_antes, janela_depois


def calcular_area_queimada_km2(dnbr_imagem, area, scale: int = 20) -> float:
    import ee

    queimado_km2 = dnbr_imagem.gte(LIMIAR_AREA_QUEIMADA).multiply(ee.Image.pixelArea().divide(1_000_000))
    stats = queimado_km2.reduceRegion(
        reducer=ee.Reducer.sum(), geometry=area, scale=scale, maxPixels=1e10, bestEffort=True
    ).getInfo()
    return float(stats.get("dNBR") or 0.0)


def processar_municipio(
    codigo_ibge: str,
    nome: str,
    janela_antes: tuple,
    janela_depois: tuple,
    ano: int,
    mes: int,
    *,
    debug: bool = False,
) -> tuple[float, str | None] | None:
    from shapely.geometry import mapping

    import ee

    from pipeline.common.ibge_malhas import buscar_geometria_municipio
    from pipeline.dnbr.sentinel2 import SemImagemValida, calcular_dnbr, preparar_exportacao

    geom_shapely = buscar_geometria_municipio(codigo_ibge)
    area_ee = ee.Geometry(mapping(geom_shapely))

    try:
        resultado = calcular_dnbr(area_ee, janela_antes, janela_depois)
    except SemImagemValida as e:
        print(f"[PULADO] {nome} ({codigo_ibge}): {e}")
        return None

    if debug:
        print(
            f"[DEBUG] {codigo_ibge}: {resultado.n_cenas_antes} cena(s) antes, {resultado.n_cenas_depois} depois, "
            f"nuvem<{resultado.limite_nuvem_usado}%, cobertura={resultado.cobertura_pct:.1f}%"
        )

    area_km2 = round(calcular_area_queimada_km2(resultado.imagem, area_ee), 2)
    if debug:
        print(f"[DEBUG] {codigo_ibge}: area_dnbr_km2={area_km2}")

    imagem_url = None
    if _r2_configurado():
        try:
            import requests

            _, colorido = preparar_exportacao(resultado.imagem, area_ee)
            thumb_url = colorido.getThumbURL(
                {"region": area_ee, "dimensions": DIMENSAO_MINIATURA_PX, "format": "png"}
            )
            if debug:
                print(f"[DEBUG] {codigo_ibge}: thumbURL do GEE = {thumb_url}")
            resposta = requests.get(thumb_url, timeout=60)
            resposta.raise_for_status()
            if debug:
                print(f"[DEBUG] {codigo_ibge}: PNG baixado, {len(resposta.content)} bytes — subindo pro R2...")
            imagem_url = _subir_miniatura_r2(resposta.content, codigo_ibge, ano, mes)
            if debug:
                print(f"[DEBUG] {codigo_ibge}: subiu pro R2 -> {imagem_url}")
        except Exception as e:
            # Miniatura e' um extra (docs/DECISIONS.md secao 6.40) — falha aqui
            # nunca deve derrubar a gravacao de area_dnbr_km2, que e' o dado
            # principal desta rodada.
            print(f"[AVISO] {nome} ({codigo_ibge}): miniatura dNBR falhou, seguindo sem imagem: {type(e).__name__}: {e}")
    elif debug:
        print(f"[DEBUG] {codigo_ibge}: R2 não configurado, pulando miniatura")

    return area_km2, imagem_url


def _buscar_municipios(conn) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute("SELECT codigo_ibge, nome FROM municipios ORDER BY codigo_ibge")
        linhas = cur.fetchall()
    return pd.DataFrame(linhas, columns=["codigo_ibge", "nome"])


def _buscar_municipio_unico(conn, codigo_ibge: str) -> pd.DataFrame:
    """Pra --municipio (debug de 1 município só, mesmo padrão de
    run_validacao_mapbiomas.py seção 6.30) — roda em minutos em vez de ~2h,
    útil pra validar a integração nova do R2 sem gastar quota do GEE nos 645."""
    with conn.cursor() as cur:
        cur.execute("SELECT codigo_ibge, nome FROM municipios WHERE codigo_ibge = %(codigo_ibge)s", {"codigo_ibge": codigo_ibge})
        linha = cur.fetchone()
    if linha is None:
        raise SystemExit(f"codigo_ibge={codigo_ibge!r} não encontrado em municipios.")
    return pd.DataFrame([linha], columns=["codigo_ibge", "nome"])


def _garantir_coluna_imagem(conn) -> None:
    """Migracao idempotente — schema.sql e aplicado manualmente no Neon
    (docs/DECISIONS.md secao 6.6), entao uma coluna nova so chega la se um
    script garantir isso (mesmo padrao de _garantir_coluna_fonte em
    run_validacao_mapbiomas.py)."""
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE metricas_anuais ADD COLUMN IF NOT EXISTS dnbr_imagem_url TEXT")


def _gravar_area_dnbr(conn, codigo_ibge: str, ano: int, area_dnbr_km2: float, imagem_url: str | None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO metricas_anuais (codigo_ibge, ano, area_dnbr_km2, dnbr_imagem_url)
            VALUES (%(codigo_ibge)s, %(ano)s, %(area_dnbr_km2)s, %(imagem_url)s)
            ON CONFLICT (codigo_ibge, ano) DO UPDATE SET
                area_dnbr_km2 = EXCLUDED.area_dnbr_km2,
                dnbr_imagem_url = COALESCE(EXCLUDED.dnbr_imagem_url, metricas_anuais.dnbr_imagem_url),
                atualizado_em = now()
            """,
            {"codigo_ibge": codigo_ibge, "ano": ano, "area_dnbr_km2": area_dnbr_km2, "imagem_url": imagem_url},
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grupo", type=int, default=1, help="1-indexado (ex.: 1 ou 2 pra 2 jobs)")
    parser.add_argument("--de-grupos", type=int, default=1)
    parser.add_argument("--ano", type=int, default=date.today().year)
    parser.add_argument(
        "--municipio",
        default=None,
        help="Testa 1 código IBGE só, ignorando --grupo/--de-grupos — roda em minutos em vez de "
        "~2h por rodada, útil pra validar a integração do R2 (docs/DECISIONS.md seção 6.40/6.41). "
        "Liga os prints [DEBUG].",
    )
    args = parser.parse_args()

    inicializar_gee()
    janela_antes, janela_depois = janela_mes_anterior(date.today())
    mes_atual = date.today().month

    with get_connection() as conn:
        _garantir_coluna_imagem(conn)
        if args.municipio:
            fatia = _buscar_municipio_unico(conn, args.municipio)
        else:
            municipios = _buscar_municipios(conn)
            fatia = dividir_em_grupo(municipios, args.grupo, args.de_grupos)

    if args.municipio:
        print(f"Modo debug --municipio: {fatia.iloc[0]['codigo_ibge']} ({fatia.iloc[0]['nome']}), ano {args.ano}")
    else:
        print(f"Grupo {args.grupo}/{args.de_grupos}: {len(fatia)} municípios. Janelas: {janela_antes} -> {janela_depois}")
    print(f"Miniatura dNBR: {'ligada (R2 configurado)' if _r2_configurado() else 'desligada (sem R2_* no ambiente)'}")

    # Conexao curta por municipio (nao 1 unica transacao pros ~320 municipios
    # do grupo, que rodam por horas — ver docs/DECISIONS.md secao 6.14):
    # progresso ja gravado sobrevive se um municipio mais a frente falhar ou
    # a conexao cair no meio do job.
    for _, row in fatia.iterrows():
        try:
            resultado = processar_municipio(
                row["codigo_ibge"],
                row["nome"],
                janela_antes,
                janela_depois,
                args.ano,
                mes_atual,
                debug=bool(args.municipio),
            )
        except Exception as e:
            print(f"[ERRO] {row['codigo_ibge']} ({row['nome']}): {type(e).__name__}: {e}")
            continue

        if resultado is None:
            continue
        area_km2, imagem_url = resultado

        with get_connection() as conn:
            _gravar_area_dnbr(conn, row["codigo_ibge"], args.ano, area_km2, imagem_url)
        print(
            f"{row['codigo_ibge']} ({row['nome']}): area_dnbr_km2={area_km2}"
            + (f" imagem={imagem_url}" if imagem_url else "")
        )


if __name__ == "__main__":
    main()
