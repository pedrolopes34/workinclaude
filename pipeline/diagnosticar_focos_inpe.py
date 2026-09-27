"""Diagnóstico (só leitura) dos focos do INPE por satélite.

    python -m pipeline.diagnosticar_focos_inpe --municipio 3539509 --ano 2024 --mes 8

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
from pathlib import Path

import pandas as pd

from pipeline.ingest.inpe import _ler_csv_focos, baixar_focos_ano, carregar_focos_sp, padronizar_nome
from pipeline.stdbscan.core import ParametrosStDbscan, resumir_eventos, rodar_stdbscan

SEEDS = Path(__file__).resolve().parent / "db" / "seeds" / "raw"
SATELITE_REFERENCIA = "AQUA_M-T"


def focos_do_recorte_com_satelite(caminho_csv: Path, municipio_df: pd.DataFrame, mes: int) -> pd.DataFrame:
    """Mesmo recorte de carregar_focos_sp + filtrar_focos_mes (estado SP, nome
    do município normalizado, mês de data_hora_gmt), devolvendo também a
    coluna `satelite` — que carregar_focos_sp descarta."""
    focos = _ler_csv_focos(caminho_csv)
    coluna_estado = next((c for c in ("estado", "uf", "state") if c in focos.columns), None)
    if coluna_estado is not None:
        focos = focos[focos[coluna_estado].apply(padronizar_nome).isin({"SAO PAULO", "SP"})]
    nomes = set(municipio_df["nome"].apply(padronizar_nome))
    focos = focos[focos["municipio"].apply(padronizar_nome).isin(nomes)].copy()
    focos["data_hora"] = pd.to_datetime(focos["data_hora_gmt"])
    focos = focos[focos["data_hora"].dt.month == mes]
    return focos.rename(columns={"lat": "latitude", "lon": "longitude"})[
        ["latitude", "longitude", "data_hora", "satelite"]
    ]


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


def anotar(titulo: str, texto: str) -> None:
    print(f"{titulo}: {texto}")
    print(f"::notice title={titulo}::{texto}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--municipio", required=True, help="Código IBGE (7 dígitos)")
    parser.add_argument("--ano", type=int, required=True)
    parser.add_argument("--mes", type=int, required=True)
    parser.add_argument("--pasta-focos", type=Path, default=Path("focos_cache_diagnostico"))
    args = parser.parse_args()

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
        f"{nome} ({args.municipio}) {args.mes:02d}/{args.ano}: {len(focos)} focos "
        f"(carregar_focos_sp, igual à consulta sob demanda: {total_consulta})",
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
