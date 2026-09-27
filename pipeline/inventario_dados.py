"""Inventário (só leitura) do que está de fato no banco de produção.

    python -m pipeline.inventario_dados

Passo 2 da especificação de evolução do produto (docs/DECISIONS.md seção
6.51): "criar inventário dos dados e identificar quais indicadores já são
realmente calculados" — antes de rotular a origem de cada número no site.
Responde, com o banco real (o sandbox do Claude Code não alcança o Neon):

1. quantas linhas por ano em metricas_anuais, e se as de 2024 dos 63
   municípios da amostra ainda são os valores da pesquisa (seed
   002_seed_metricas_anuais_2024.sql, que são de AGOSTO de 2024) ou se
   o pipeline já as sobrescreveu com o ano inteiro;
2. validacao_mapbiomas por ano × fonte × confiabilidade;
3. consultas_sob_demanda por status;
4. a data da última atualização de cada tabela.

Também imprime como anotações do Actions (`::notice::`), legíveis pela API
REST sem baixar o log inteiro.
"""

import re
from pathlib import Path

from pipeline.common.db import get_connection

SEED_METRICAS_2024 = Path(__file__).resolve().parent / "db" / "seeds" / "002_seed_metricas_anuais_2024.sql"
_LINHA_SEED = re.compile(r"\('(\d{7})', 2024, (\d+|NULL), (\d+|NULL),")


def valores_seed_2024(texto_sql: str) -> dict[str, tuple[int | None, int | None]]:
    """{codigo_ibge: (num_focos_calor, num_agrupamentos)} do seed de 2024."""
    def _int(v: str) -> int | None:
        return None if v == "NULL" else int(v)

    return {cod: (_int(focos), _int(agr)) for cod, focos, agr in _LINHA_SEED.findall(texto_sql)}


def anotar(titulo: str, texto: str) -> None:
    print(f"{titulo}: {texto}")
    print(f"::notice title={titulo}::{texto}")


def main() -> None:
    seed = valores_seed_2024(SEED_METRICAS_2024.read_text(encoding="utf-8"))

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*), count(*) FILTER (WHERE na_amostra) FROM municipios")
        total, amostra = cur.fetchone()
        anotar("Municipios", f"{total} no total, {amostra} na amostra")

        cur.execute(
            "SELECT ano, count(*), count(dnbr_imagem_url), max(atualizado_em)::date "
            "FROM metricas_anuais GROUP BY ano ORDER BY ano"
        )
        anotar(
            "metricas_anuais por ano",
            " | ".join(f"{ano}: {n} linhas, {img} com imagem, atualizado {data}" for ano, n, img, data in cur.fetchall()),
        )

        cur.execute(
            "SELECT codigo_ibge, num_focos_calor, num_agrupamentos FROM metricas_anuais WHERE ano = 2024"
        )
        linhas_2024 = {cod: (focos, agr) for cod, focos, agr in cur.fetchall()}
        iguais = sum(1 for cod, valores in seed.items() if linhas_2024.get(cod) == valores)
        diferentes = sorted(cod for cod in seed if cod in linhas_2024 and linhas_2024[cod] != seed[cod])
        fora_da_amostra = len(set(linhas_2024) - set(seed))
        anotar(
            "2024 vs seed da pesquisa",
            f"{iguais} de {len(seed)} linhas da amostra iguais ao seed (ago/2024) | "
            f"{len(diferentes)} diferentes{': ' + ', '.join(diferentes[:10]) if diferentes else ''} | "
            f"{fora_da_amostra} linhas de 2024 fora da amostra",
        )

        cur.execute(
            "SELECT ano, fonte, confiabilidade, count(*) FROM validacao_mapbiomas "
            "GROUP BY ano, fonte, confiabilidade ORDER BY ano, fonte, confiabilidade"
        )
        anotar(
            "validacao_mapbiomas",
            " | ".join(f"{ano} {fonte} {conf}={n}" for ano, fonte, conf, n in cur.fetchall()),
        )

        cur.execute("SELECT to_regclass('consultas_sob_demanda') IS NOT NULL")
        if cur.fetchone()[0]:
            cur.execute("SELECT status, count(*) FROM consultas_sob_demanda GROUP BY status ORDER BY status")
            anotar("consultas_sob_demanda", " | ".join(f"{s}={n}" for s, n in cur.fetchall()) or "vazia")


if __name__ == "__main__":
    main()
