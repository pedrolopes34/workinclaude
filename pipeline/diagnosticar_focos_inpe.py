"""Diagnóstico (só leitura) dos focos do INPE por satélite.

    python -m pipeline.diagnosticar_focos_inpe --municipio 3539509 --ano 2024 --mes 8
    python -m pipeline.diagnosticar_focos_inpe --amostra
    python -m pipeline.diagnosticar_focos_inpe --listar-inpe

`--listar-inpe` (docs/DECISIONS.md seção 6.55): percorre os índices de
pasta do dataserver do INPE a partir de `focos/csv/` e resume o que existe
em cada pasta. O download mensal não alcança 2018-2023 (todos os meses dão
404), o que zera o teto histórico do ST-DBSCAN e impede validar esses anos;
a pesquisa usou `focos_br_sp_ref_AAAA.csv`, um produto anual — a listagem
mostra onde ele fica, sem adivinhar URL.

`--amostra` (docs/DECISIONS.md seção 6.53): pros 63 municípios da pesquisa,
recalcula ago/2024 só com o satélite de referência e compara focos,
agrupamentos e área com o seed — inclusive a área recortada pelo limite do
município, pra testar a hipótese da seção 6.51 — e conta o satélite de
referência mês a mês no estado em 2025 e 2026 (o Aqua está em fim de vida).

Criado quando a 1ª consulta sob demanda real (Pitangueiras, ago/2024,
docs/DECISIONS.md seção 6.51) contou 1.588 focos onde a pesquisa validada
conta 95 no mesmo recorte. Hipótese: o pipeline baixa o produto mensal
"todos os satélites" do INPE (pendência 1 do topo de pipeline/ingest/inpe.py)
e a pesquisa usou o arquivo `_ref_` — só o satélite de referência. O sandbox
do Claude Code não alcança o INPE; o runner do GitHub Actions alcança
(`diagnostico-focos-inpe.yml`).

Refaz o mesmo recorte da consulta (carregar_focos_sp + mês), mas mantendo a
coluna `satelite`, e roda o ST-DBSCAN com todos os satélites e só com o de
referência, ao lado dos números da pesquisa quando o recorte é o da amostra
validada (ago/2024). Também imprime como anotações do Actions (`::notice::`),
legíveis pela API REST sem baixar o log inteiro.
"""

import argparse
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

from pipeline.ingest.inpe import (
    SATELITE_REFERENCIA,
    _ler_csv_focos,
    baixar_focos_ano,
    carregar_focos_sp,
    padronizar_nome,
)
from pipeline.common.geo import projetar_para_utm_km, unir_buffers
from pipeline.stdbscan.core import ParametrosStDbscan, resumir_eventos, rodar_stdbscan

SEEDS = Path(__file__).resolve().parent / "db" / "seeds" / "raw"


def focos_sp_com_satelite(caminho_csv: Path, municipios_df: pd.DataFrame) -> pd.DataFrame:
    """Mesmo cruzamento de carregar_focos_sp (estado SP, nome do município
    normalizado), com codigo_ibge e a coluna `satelite` — e sem filtrar
    satélite nenhum, pra poder comparar."""
    focos = _ler_csv_focos(caminho_csv)
    coluna_estado = next((c for c in ("estado", "uf", "state") if c in focos.columns), None)
    if coluna_estado is not None:
        focos = focos[focos[coluna_estado].apply(padronizar_nome).isin({"SAO PAULO", "SP"})]
    focos = focos.assign(municipio_padrao=focos["municipio"].apply(padronizar_nome))
    ibge = municipios_df.assign(municipio_padrao=municipios_df["nome"].apply(padronizar_nome))
    focos = focos.merge(ibge[["codigo_ibge", "municipio_padrao"]], on="municipio_padrao", how="inner")
    focos["data_hora"] = pd.to_datetime(focos["data_hora_gmt"])
    return focos.rename(columns={"lat": "latitude", "lon": "longitude"})[
        ["codigo_ibge", "latitude", "longitude", "data_hora", "satelite"]
    ]


def focos_do_recorte_com_satelite(caminho_csv: Path, municipio_df: pd.DataFrame, mes: int) -> pd.DataFrame:
    """Mesmo recorte de carregar_focos_sp + filtrar_focos_mes (estado SP, nome
    do município normalizado, mês de data_hora_gmt), devolvendo também a
    coluna `satelite`."""
    focos = focos_sp_com_satelite(caminho_csv, municipio_df)
    return focos[focos["data_hora"].dt.month == mes]


def resumo_stdbscan(focos: pd.DataFrame, min_samples: int) -> tuple[int, float]:
    """(nº de agrupamentos, área somada em km²) — mesmo cálculo da consulta."""
    parametros = ParametrosStDbscan(min_samples=min_samples)
    eventos = resumir_eventos(rodar_stdbscan(focos, parametros), parametros.eps_space_km)
    area = round(float(eventos["area_km2"].sum()), 2) if not eventos.empty else 0.0
    return len(eventos), area


def numeros_da_pesquisa(nome: str, ano: int, mes: int) -> dict | None:
    """Números validados da pesquisa pro recorte (seed validacao_mapbiomas_63),
    que só existe pra ago/2024 dos 63 municípios da amostra — fora disso, None."""
    if (ano, mes) != (2024, 8):
        return None
    seed = pd.read_csv(SEEDS / "validacao_mapbiomas_63.csv")
    linha = seed[seed["cidade"].apply(padronizar_nome) == padronizar_nome(nome)]
    if linha.empty:
        return None
    linha = linha.iloc[0]
    area = linha["area_st_dbscan_km2"]
    return {
        "n_focos": int(linha["n_focos_ago24"]),
        "n_agrupamentos": int(linha["n_clusters_ago24"]),
        "area_st_dbscan_km2": None if pd.isna(area) else float(area),
    }


_LINHA_SEED = re.compile(r"\('(\d{7})', 2024, (\d+|NULL), (\d+|NULL), ([\d.]+|NULL),")


def amostra_da_pesquisa(texto_sql: str) -> dict[str, tuple[int | None, int | None, float | None]]:
    """{codigo_ibge: (focos, agrupamentos, area_st_dbscan_km2)} de ago/2024 —
    seed 002_seed_metricas_anuais_2024.sql, os números da pesquisa."""
    def _num(v: str, tipo):
        return None if v == "NULL" else tipo(v)

    return {
        cod: (_num(focos, int), _num(agr, int), _num(area, float))
        for cod, focos, agr, area in _LINHA_SEED.findall(texto_sql)
    }


def areas_dos_agrupamentos(focos: pd.DataFrame, min_samples: int, municipio_wgs84) -> tuple[int, float, float]:
    """(nº de agrupamentos, área somada, área somada recortada pelo município),
    em km² — a primeira é o que o pipeline grava hoje (resumir_eventos); a
    segunda testa se a pesquisa recortou pelo limite do município."""
    parametros = ParametrosStDbscan(min_samples=min_samples)
    clusterizado = rodar_stdbscan(focos, parametros)
    agrupados = clusterizado[clusterizado["cluster"] != -1]
    if agrupados.empty:
        return 0, 0.0, 0.0
    metros, epsg = projetar_para_utm_km(agrupados)
    municipio_m = gpd.GeoSeries([municipio_wgs84], crs="EPSG:4326").to_crs(epsg).iloc[0]
    total = recortada = 0.0
    for _, grupo in metros.groupby("cluster"):
        poligono = unir_buffers(grupo["x_km"], grupo["y_km"], parametros.eps_space_km * 1000)
        total += poligono.area
        recortada += poligono.intersection(municipio_m).area
    return int(agrupados["cluster"].nunique()), round(total / 1e6, 2), round(recortada / 1e6, 2)


def resumo_satelite_por_mes(focos: pd.DataFrame) -> str:
    """'jan: 12 de 340 | fev: ...' — focos do satélite de referência sobre o
    total, por mês."""
    partes = []
    for mes, grupo in focos.groupby(focos["data_hora"].dt.month):
        partes.append(f"{mes:02d}: {int((grupo['satelite'] == SATELITE_REFERENCIA).sum())} de {len(grupo)}")
    return " | ".join(partes) or "sem focos"


def _amostra() -> tuple[pd.DataFrame, dict]:
    municipios = pd.read_csv(SEEDS / "municipios_sp.csv", dtype={"codigo_ibge": str})
    pesquisa = amostra_da_pesquisa((SEEDS.parent / "002_seed_metricas_anuais_2024.sql").read_text(encoding="utf-8"))
    return municipios[municipios["codigo_ibge"].isin(pesquisa)], pesquisa


def rodar_amostra(pasta_focos: Path) -> None:
    amostra, _ = _amostra()
    focos = focos_sp_com_satelite(baixar_focos_ano(2024, pasta_focos), amostra)
    agosto_ref = focos[(focos["data_hora"].dt.month == 8) & (focos["satelite"] == SATELITE_REFERENCIA)]
    comparar_amostra(agosto_ref, "Amostra")



def comparar_amostra(agosto_ref: pd.DataFrame, prefixo: str) -> None:
    """Focos de ago/2024 (já só do satélite de referência) contra os números
    da pesquisa, município a município: focos, agrupamentos e área."""
    from pipeline.common.ibge_malhas import buscar_geometria_municipio

    amostra, pesquisa = _amostra()
    linhas = []
    for _, m in amostra.iterrows():
        cod = m["codigo_ibge"]
        focos_pesq, agr_pesq, area_pesq = pesquisa[cod]
        do_municipio = agosto_ref[agosto_ref["codigo_ibge"] == cod]
        # Mesmo foco listado mais de uma vez (mesma posição e horário) — o
        # arquivo _ref_ da pesquisa pode não ter essas repetições (seção 6.53).
        unicos = do_municipio.drop_duplicates(subset=["latitude", "longitude", "data_hora"])
        agr_unicos, _, _ = areas_dos_agrupamentos(unicos, 4, box(0, 0, 0, 0))
        geom = buscar_geometria_municipio(cod)
        agr4, area4, rec4 = areas_dos_agrupamentos(do_municipio, 4, geom)
        agr2, area2, rec2 = areas_dos_agrupamentos(do_municipio, 2, geom)
        linhas.append(
            {"cod": cod, "nome": m["nome"], "focos_pesq": focos_pesq, "focos": len(do_municipio),
             "focos_unicos": len(unicos), "agr_unicos": agr_unicos,
             "agr_pesq": agr_pesq, "agr4": agr4, "agr2": agr2, "area_pesq": area_pesq,
             "area4": area4, "rec4": rec4, "area2": area2, "rec2": rec2}
        )
        print(
            f"{m['nome']:<28} focos {focos_pesq}->{len(do_municipio)} (únicos {len(unicos)}) | agr {agr_pesq}->{agr4} (ms4) {agr2} (ms2) | "
            f"área {area_pesq} -> {area4} / recortada {rec4} (ms4); {area2} / recortada {rec2} (ms2)"
        )

    df = pd.DataFrame(linhas)
    n = len(df)
    dif_focos = (df["focos"] - df["focos_pesq"]).abs()
    anotar(
        f"{prefixo}: focos ago2024 so AQUA_M-T",
        f"{int((dif_focos == 0).sum())} de {n} iguais | {int((dif_focos <= df['focos_pesq'].clip(lower=1) * 0.1).sum())} "
        f"a ate 10% | pesquisa soma {int(df['focos_pesq'].sum())}, aqui soma {int(df['focos'].sum())}",
    )
    dif_unicos = (df["focos_unicos"] - df["focos_pesq"]).abs()
    anotar(
        f"{prefixo}: focos unicos (sem repeticao)",
        f"{int((dif_unicos == 0).sum())} de {n} iguais | {int((dif_unicos <= df['focos_pesq'].clip(lower=1) * 0.1).sum())} "
        f"a ate 10% | soma {int(df['focos_unicos'].sum())} (pesquisa {int(df['focos_pesq'].sum())}) | "
        f"agrupamentos iguais com focos unicos e min_samples=4: {int((df['agr_unicos'] == df['agr_pesq']).sum())} de {n}",
    )
    bate4 = df["agr4"] == df["agr_pesq"]
    bate2 = df["agr2"] == df["agr_pesq"]
    anotar(
        f"{prefixo}: agrupamentos",
        f"iguais com min_samples=4: {int(bate4.sum())} de {n} | com 2: {int(bate2.sum())} | com um dos dois: {int((bate4 | bate2).sum())}",
    )
    com_area = df[df["area_pesq"].notna() & (df["area_pesq"] > 0)]
    # Pra área, usa o min_samples que reproduz os agrupamentos (4 se empatar).
    area_sem = com_area.apply(lambda r: r["area4"] if r["agr4"] == r["agr_pesq"] or r["agr2"] != r["agr_pesq"] else r["area2"], axis=1)
    area_rec = com_area.apply(lambda r: r["rec4"] if r["agr4"] == r["agr_pesq"] or r["agr2"] != r["agr_pesq"] else r["rec2"], axis=1)
    razao_sem = area_sem / com_area["area_pesq"]
    razao_rec = area_rec / com_area["area_pesq"]
    anotar(
        f"{prefixo}: area dos agrupamentos",
        f"{len(com_area)} municipios com area | sem recorte: mediana {razao_sem.median():.2f}x da pesquisa, "
        f"{int(((razao_sem - 1).abs() <= 0.05).sum())} a ate 5% | recortada pelo municipio: mediana {razao_rec.median():.2f}x, "
        f"{int(((razao_rec - 1).abs() <= 0.05).sum())} a ate 5%",
    )

    todos_sp = pd.read_csv(SEEDS / "municipios_sp.csv", dtype={"codigo_ibge": str})
    for ano in (2025, 2026):
        focos_ano = focos_sp_com_satelite(baixar_focos_ano(ano, pasta_focos), todos_sp)
        anotar(f"SP {ano}: {SATELITE_REFERENCIA} por mes", resumo_satelite_por_mes(focos_ano))


RAIZ_INPE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/"


def entradas_do_indice(html: str) -> list[str]:
    """Nomes listados num índice de pasta (autoindex do Apache/nginx), sem
    os links de ordenação (`?C=N;O=D`), o da pasta pai e links absolutos."""
    nomes = []
    for href in re.findall(r'href="([^"]+)"', html):
        if href.startswith(("?", "/", "#", "..", "http:", "https:", "mailto:")):
            continue
        nomes.append(href)
    return list(dict.fromkeys(nomes))


def resumir_pasta(caminho: str, entradas: list[str]) -> str:
    pastas = [e.rstrip("/") for e in entradas if e.endswith("/")]
    arquivos = [e for e in entradas if not e.endswith("/")]
    partes = [f"{caminho or 'csv/'}"]
    if pastas:
        partes.append(f"{len(pastas)} pastas: {', '.join(pastas[:30])}{' ...' if len(pastas) > 30 else ''}")
    if arquivos:
        amostra = arquivos if len(arquivos) <= 6 else arquivos[:3] + ["..."] + arquivos[-3:]
        partes.append(f"{len(arquivos)} arquivos: {', '.join(amostra)}")
    return " | ".join(partes)


def listar_inpe(max_nivel: int = 3, max_pastas: int = 60) -> list[str]:
    """Resumo de cada pasta sob RAIZ_INPE até `max_nivel` de profundidade.
    Pastas de estado (27 por produto) só entram quando o nome é SP, pra não
    gastar requisição à toa."""
    import requests

    resumo = []
    fila = [(RAIZ_INPE, 0)]
    visitadas = 0
    while fila and visitadas < max_pastas:
        url, nivel = fila.pop(0)
        visitadas += 1
        caminho = url.removeprefix(RAIZ_INPE)
        try:
            resposta = requests.get(url, timeout=60)
        except requests.RequestException as e:
            resumo.append(f"{caminho or 'csv/'} -> {type(e).__name__}")
            continue
        if resposta.status_code != 200:
            resumo.append(f"{caminho or 'csv/'} -> HTTP {resposta.status_code}")
            continue
        entradas = entradas_do_indice(resposta.text)
        resumo.append(resumir_pasta(caminho, entradas))
        if nivel >= max_nivel:
            continue
        for entrada in entradas:
            if not entrada.endswith("/"):
                continue
            nome = entrada.rstrip("/")
            if len(nome) == 2 and nome.isalpha() and nome.upper() != "SP":
                continue
            fila.append((url + entrada, nivel + 1))
    return resumo


URL_REF_SP_ANUAL = RAIZ_INPE + "anual/EstadosBr_sat_ref/SP/focos_br_sp_ref_{ano}.zip"


def normalizar_focos_ref(bruto: pd.DataFrame, municipios_df: pd.DataFrame) -> pd.DataFrame:
    """Arquivo anual `_ref_` do INPE -> (codigo_ibge, latitude, longitude,
    data_hora, satelite), casando o município pelo nome normalizado como o
    pipeline. Aceita os dois esquemas de coluna que o INPE já usou
    (lat/lon/data_hora_gmt e latitude/longitude/data_pas)."""
    def coluna(*opcoes: str) -> str:
        for c in opcoes:
            if c in bruto.columns:
                return c
        raise KeyError(f"nenhuma de {opcoes} em {list(bruto.columns)}")

    lat, lon = coluna("lat", "latitude"), coluna("lon", "longitude")
    data = coluna("data_hora_gmt", "data_pas", "datahora", "data_hora")
    focos = bruto.assign(municipio_padrao=bruto[coluna("municipio")].apply(padronizar_nome))
    ibge = municipios_df.assign(municipio_padrao=municipios_df["nome"].apply(padronizar_nome))
    focos = focos.merge(ibge[["codigo_ibge", "municipio_padrao"]], on="municipio_padrao", how="inner")
    return pd.DataFrame(
        {
            "codigo_ibge": focos["codigo_ibge"],
            "latitude": focos[lat],
            "longitude": focos[lon],
            "data_hora": pd.to_datetime(focos[data]),
            "satelite": focos["satelite"] if "satelite" in focos.columns else SATELITE_REFERENCIA,
        }
    )


def comparar_ref(pasta_focos: Path) -> None:
    """O arquivo anual de referência de SP (o da pesquisa) contra os números
    da pesquisa, e contra o que o pipeline baixa hoje (mensal, filtrado)."""
    import requests

    indice = requests.get(RAIZ_INPE + "mensal/Brasil/", timeout=60)
    entradas = entradas_do_indice(indice.text)
    zips = sorted(e for e in entradas if e.endswith(".zip"))
    csvs = sorted(e for e in entradas if e.endswith(".csv"))
    anotar(
        "mensal/Brasil por formato",
        f"zip: {len(zips)} ({zips[0] if zips else '-'} a {zips[-1] if zips else '-'}) | "
        f"csv: {len(csvs)} ({csvs[0] if csvs else '-'} a {csvs[-1] if csvs else '-'})",
    )

    pasta_focos.mkdir(parents=True, exist_ok=True)
    caminho = pasta_focos / "focos_br_sp_ref_2024.zip"
    resposta = requests.get(URL_REF_SP_ANUAL.format(ano=2024), timeout=300)
    resposta.raise_for_status()
    caminho.write_bytes(resposta.content)
    bruto = _ler_csv_focos(caminho)
    anotar(
        "SP ref 2024: arquivo",
        f"{len(resposta.content) // 1024} KB | {len(bruto)} linhas | colunas {list(bruto.columns)} | "
        f"primeira linha {bruto.iloc[0].to_dict()}",
    )
    if "satelite" in bruto.columns:
        anotar("SP ref 2024: satelites", " | ".join(f"{k}={v}" for k, v in bruto["satelite"].value_counts().items()))

    amostra, _ = _amostra()
    focos = normalizar_focos_ref(bruto, amostra)
    agosto = focos[focos["data_hora"].dt.month == 8]
    comparar_amostra(agosto, "Arquivo ref SP")


def _escapar(texto: str, propriedade: bool) -> str:
    """Escape do formato de comando do Actions (`::notice title=...::msg`)."""
    texto = texto.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return texto.replace(":", "%3A").replace(",", "%2C") if propriedade else texto


def anotar(titulo: str, texto: str) -> None:
    print(f"{titulo}: {texto}")
    print(f"::notice title={_escapar(titulo, True)}::{_escapar(texto, False)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--amostra", action="store_true", help="Compara os 63 da pesquisa (seção 6.53)")
    parser.add_argument("--listar-inpe", action="store_true", help="Lista as pastas do dataserver do INPE (seção 6.55)")
    parser.add_argument(
        "--comparar-ref", action="store_true", help="Amostra de ago/2024 com o arquivo anual de referência de SP (seção 6.55)"
    )
    parser.add_argument("--municipio", help="Código IBGE (7 dígitos)")
    parser.add_argument("--ano", type=int)
    parser.add_argument("--mes", type=int)
    parser.add_argument("--pasta-focos", type=Path, default=Path("focos_cache_diagnostico"))
    args = parser.parse_args()

    if args.amostra:
        rodar_amostra(args.pasta_focos)
        return
    if args.comparar_ref:
        comparar_ref(args.pasta_focos)
        return
    if args.listar_inpe:
        resumo = listar_inpe()
        for linha in resumo:
            print(linha)
        # O Actions guarda poucas anotações por passo: junta em blocos.
        for i in range(0, len(resumo), 8):
            anotar(f"INPE pastas {i // 8 + 1}", " || ".join(resumo[i : i + 8]))
        return
    if not (args.municipio and args.ano and args.mes):
        parser.error("informe --municipio, --ano e --mes (ou --amostra)")

    municipios = pd.read_csv(SEEDS / "municipios_sp.csv", dtype={"codigo_ibge": str})
    municipio_df = municipios[municipios["codigo_ibge"] == args.municipio]
    if municipio_df.empty:
        raise SystemExit(f"Código IBGE {args.municipio} não está em municipios_sp.csv.")
    nome = municipio_df.iloc[0]["nome"]

    caminho_csv = baixar_focos_ano(args.ano, args.pasta_focos)
    total_consulta = int((carregar_focos_sp(caminho_csv, municipio_df)["mes"] == args.mes).sum())
    focos = focos_do_recorte_com_satelite(caminho_csv, municipio_df, args.mes)

    anotar(
        "Recorte",
        f"{nome} ({args.municipio}) {args.mes:02d}/{args.ano}: {len(focos)} focos de todos os satélites | "
        f"{total_consulta} do satélite de referência (o que o pipeline e a consulta usam)",
    )
    por_satelite = focos["satelite"].value_counts()
    anotar("Focos por satelite", " | ".join(f"{sat}={n}" for sat, n in por_satelite.items()))

    so_referencia = focos[focos["satelite"] == SATELITE_REFERENCIA]
    for rotulo, subconjunto in (("Todos os satelites", focos), (f"So {SATELITE_REFERENCIA}", so_referencia)):
        partes = []
        for min_samples in (4, 2):
            n, area = resumo_stdbscan(subconjunto, min_samples)
            partes.append(f"min_samples={min_samples} -> {n} agrupamentos, {area} km2")
        anotar(rotulo, f"{len(subconjunto)} focos | " + " | ".join(partes))

    pesquisa = numeros_da_pesquisa(nome, args.ano, args.mes)
    if pesquisa:
        anotar(
            "Pesquisa validada",
            f"{pesquisa['n_focos']} focos | {pesquisa['n_agrupamentos']} agrupamentos | "
            f"{pesquisa['area_st_dbscan_km2']} km2",
        )
    else:
        print("(sem números da pesquisa pra esse recorte — o seed só tem ago/2024 dos 63 da amostra)")


if __name__ == "__main__":
    main()
