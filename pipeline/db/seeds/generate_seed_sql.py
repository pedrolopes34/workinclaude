#!/usr/bin/env python3
"""
Gera os arquivos SQL de seed a partir dos CSVs em pipeline/db/seeds/raw/.

Fontes:
- raw/municipios_sp.csv: 645 municipios de SP (codigo_ibge, nome), a partir
  do dataset publico kelvins/municipios-brasileiros (API oficial do IBGE
  esta bloqueada pela politica de rede deste ambiente — ver
  docs/DECISIONS.md secao 6.2).
- raw/validacao_mapbiomas_63.csv: transcricao de
  Tabela_Final_63_Municipios.xlsx (Google Drive, pasta
  19_tabela_final_holistica) — comparacao agosto/2024 vs. MapBiomas Fogo
  Colecao 4, lida via mcp Google Drive nesta sessao.

Uso: python3 generate_seed_sql.py
Escreve 001_seed_municipios.sql, 002_seed_metricas_anuais_2024.sql e
003_seed_validacao_mapbiomas_2024.sql em pipeline/db/seeds/.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")

ANO_REFERENCIA = 2024  # agosto/2024 — unica rodada formal ja fechada vs. MapBiomas


def sql_str(v):
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    if v is None or v == "":
        return "NULL"
    return str(v)


def sql_bool(v):
    if v is None or v == "":
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    return "true" if str(v).strip().lower() in ("true", "1", "sim") else "false"


def confiabilidade(n_clusters, recall_pct, p_valor):
    """Regra fixa — docs/DECISIONS.md secao 1.3."""
    if n_clusters == 0:
        return "Insuficiente"
    recall_ok = recall_pct is not None and recall_pct >= 50
    p_ok = p_valor is not None and p_valor < 0.05
    if recall_ok and p_ok:
        return "Alta"
    if recall_ok or p_ok:
        return "Média"
    return "Baixa"


def load_municipios_sp():
    by_name = {}
    with open(os.path.join(RAW, "municipios_sp.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            by_name[row["nome"].strip()] = row["codigo_ibge"].strip()
    return by_name


def load_validacao_63():
    with open(os.path.join(RAW, "validacao_mapbiomas_63.csv"), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def as_float(v):
    return float(v) if v not in (None, "") else None


def as_int(v):
    return int(v) if v not in (None, "") else None


def main():
    municipios_by_name = load_municipios_sp()
    validacao_rows = load_validacao_63()

    unmatched = [r["cidade"] for r in validacao_rows if r["cidade"] not in municipios_by_name]
    if unmatched:
        raise SystemExit(f"ERRO: {len(unmatched)} municipio(s) da planilha de validacao nao encontrados "
                          f"em municipios_sp.csv (conferir grafia/acentos): {unmatched}")

    amostra_by_codigo = {}
    for r in validacao_rows:
        codigo = municipios_by_name[r["cidade"]]
        amostra_by_codigo[codigo] = r

    # ---------------------------------------------------------------
    # 001: municipios — todos os 645, com os 63 da amostra enriquecidos
    # ---------------------------------------------------------------
    out1 = os.path.join(HERE, "001_seed_municipios.sql")
    with open(out1, "w", encoding="utf-8") as f:
        f.write("-- Gerado por generate_seed_sql.py — nao editar a mao, editar os CSVs em raw/ e regerar.\n")
        f.write("-- 645 municipios de SP; os 63 da Tabela_Final_63_Municipios.xlsx vem com mesorregiao/\n")
        f.write("-- area_km2/bioma/grupo_amostra preenchidos e na_amostra=true.\n\n")
        f.write("INSERT INTO municipios (codigo_ibge, nome, mesorregiao, area_km2, bioma, na_amostra, grupo_amostra)\nVALUES\n")
        values = []
        for nome, codigo in sorted(municipios_by_name.items(), key=lambda kv: kv[1]):
            amostra = amostra_by_codigo.get(codigo)
            if amostra:
                values.append(
                    f"    ({sql_str(codigo)}, {sql_str(nome)}, {sql_str(amostra['mesorregiao'])}, "
                    f"{sql_num(amostra['area_km2'])}, {sql_str(amostra['bioma'])}, true, "
                    f"{sql_str(amostra['grupo_amostra'])})"
                )
            else:
                values.append(f"    ({sql_str(codigo)}, {sql_str(nome)}, NULL, NULL, NULL, false, NULL)")
        f.write(",\n".join(values))
        f.write("\nON CONFLICT (codigo_ibge) DO UPDATE SET\n")
        f.write("    nome = EXCLUDED.nome, mesorregiao = EXCLUDED.mesorregiao, area_km2 = EXCLUDED.area_km2,\n")
        f.write("    bioma = EXCLUDED.bioma, na_amostra = EXCLUDED.na_amostra, grupo_amostra = EXCLUDED.grupo_amostra,\n")
        f.write("    atualizado_em = now();\n")

    # ---------------------------------------------------------------
    # 002: metricas_anuais — os 63, ano de referencia = agosto/2024
    # ---------------------------------------------------------------
    out2 = os.path.join(HERE, "002_seed_metricas_anuais_2024.sql")
    with open(out2, "w", encoding="utf-8") as f:
        f.write("-- Gerado por generate_seed_sql.py — nao editar a mao.\n")
        f.write(f"-- N-foco/agrupamento representam a janela ago/{ANO_REFERENCIA} (unica rodada formal\n")
        f.write("-- ja fechada vs. MapBiomas ate agora), nao um agregado dos 12 meses do ano.\n\n")
        f.write("INSERT INTO metricas_anuais (codigo_ibge, ano, num_focos_calor, num_agrupamentos, "
                "area_st_dbscan_km2, area_dnbr_km2)\nVALUES\n")
        values = []
        for codigo, r in sorted(amostra_by_codigo.items()):
            values.append(
                f"    ({sql_str(codigo)}, {ANO_REFERENCIA}, {sql_num(r['n_focos_ago24'])}, "
                f"{sql_num(r['n_clusters_ago24'])}, {sql_num(r['area_st_dbscan_km2'])}, "
                f"{sql_num(r['area_dnbr_km2'])})"
            )
        f.write(",\n".join(values))
        f.write("\nON CONFLICT (codigo_ibge, ano) DO UPDATE SET\n")
        f.write("    num_focos_calor = EXCLUDED.num_focos_calor, num_agrupamentos = EXCLUDED.num_agrupamentos,\n")
        f.write("    area_st_dbscan_km2 = EXCLUDED.area_st_dbscan_km2, area_dnbr_km2 = EXCLUDED.area_dnbr_km2,\n")
        f.write("    atualizado_em = now();\n")

    # ---------------------------------------------------------------
    # 003: validacao_mapbiomas — os 63, confiabilidade calculada aqui
    # ---------------------------------------------------------------
    out3 = os.path.join(HERE, "003_seed_validacao_mapbiomas_2024.sql")
    with open(out3, "w", encoding="utf-8") as f:
        f.write("-- Gerado por generate_seed_sql.py — nao editar a mao.\n")
        f.write("-- confiabilidade calculada pela regra fixa (docs/DECISIONS.md secao 1.3), nao copiada\n")
        f.write("-- da coluna 'Resultado Positivo?' da planilha original (criterio diferente, mais simples).\n\n")
        f.write("INSERT INTO validacao_mapbiomas (codigo_ibge, ano, area_mapbiomas_km2, interseccao_pct, "
                "p_valor, recall_pct, complemento_mb_km2, confiabilidade, validacao_temporal, data_comparacao)\nVALUES\n")
        values = []
        stats = {"Alta": 0, "Média": 0, "Baixa": 0, "Insuficiente": 0}
        for codigo, r in sorted(amostra_by_codigo.items()):
            n_clusters = as_int(r["n_clusters_ago24"])
            recall_pct = as_float(r["recall_pct"])
            p_valor = as_float(r["p_valor"])
            iou = as_float(r["iou"])
            interseccao_pct = round(iou * 100, 2) if iou is not None else None
            conf = confiabilidade(n_clusters, recall_pct, p_valor)
            stats[conf] += 1
            values.append(
                f"    ({sql_str(codigo)}, {ANO_REFERENCIA}, {sql_num(r['area_mapbiomas_km2'])}, "
                f"{sql_num(interseccao_pct)}, {sql_num(p_valor)}, {sql_num(recall_pct)}, "
                f"{sql_num(r['comp_mb_km2'])}, {sql_str(conf)}, {sql_str(r['validacao_temporal'])}, "
                f"DATE '2024-08-31')"
            )
        f.write(",\n".join(values))
        f.write("\nON CONFLICT (codigo_ibge, ano) DO UPDATE SET\n")
        f.write("    area_mapbiomas_km2 = EXCLUDED.area_mapbiomas_km2, interseccao_pct = EXCLUDED.interseccao_pct,\n")
        f.write("    p_valor = EXCLUDED.p_valor, recall_pct = EXCLUDED.recall_pct,\n")
        f.write("    complemento_mb_km2 = EXCLUDED.complemento_mb_km2, confiabilidade = EXCLUDED.confiabilidade,\n")
        f.write("    validacao_temporal = EXCLUDED.validacao_temporal, atualizado_em = now();\n")

    print(f"OK: {len(municipios_by_name)} municipios | {len(amostra_by_codigo)} na amostra")
    print(f"Distribuicao de confiabilidade calculada: {stats}")
    print(f"Escrito: {out1}\n         {out2}\n         {out3}")


if __name__ == "__main__":
    main()
