"""CLI: registra a auditoria anual manual (o controle que substituiu o gate
de aprovação do pipeline, docs/DECISIONS.md seção 2.5), gravando em
`auditorias_anuais`. Inserir uma linha aqui é o que avança `ano_ativo`
(view = MAX(ano_referencia) dessa tabela, com fallback em cascata — schema.sql).

Rodado manualmente por Pedro, 1x/ano, via `audit-anual.yml`
(só `workflow_dispatch`, sem cron — nunca automático).

Dois modos, pelos mesmos argumentos:

1. Auditoria sem correção (caso comum — dado do ano já conferido e ok):
       python -m pipeline.run_audit_anual --ano 2025 \
           --descricao "Revisão anual: dados conferidos, nenhuma correção necessária"

2. Auditoria com correção pontual de um município/ano (além do acima, passe
   os 4 juntos):
       python -m pipeline.run_audit_anual --ano 2025 \
           --descricao "Recall recalculado após correção de geometria" \
           --codigo-ibge 3552403 --tabela validacao_mapbiomas \
           --campo recall_pct --valor-novo 62.4
   O script lê o valor atual (vira `dados_anteriores`), aplica o UPDATE e
   grava os dois lados na mesma transação — nunca corrige sem deixar
   rastro de qual era o valor antes. `--tabela`/`--campo` são validados
   contra uma lista fixa (CAMPOS_CORRIGIVEIS) antes de entrar em SQL.

NÃO EXECUTÁVEL/TESTÁVEL nesta sessão (precisa de `DATABASE_URL` real); a
validação de campos e a coerção de tipo são puras e têm testes em
tests/pipeline/test_run_audit_anual.py.
"""

import argparse
from datetime import date
from decimal import Decimal

from psycopg import sql
from psycopg.types.json import Jsonb

from pipeline.common.db import get_connection

CAMPOS_CORRIGIVEIS = {
    "metricas_anuais": {
        "num_focos_calor",
        "num_agrupamentos",
        "area_st_dbscan_km2",
        "area_dnbr_km2",
        "eps_space_km",
        "eps_time_days",
        "min_samples",
    },
    "validacao_mapbiomas": {
        "area_mapbiomas_km2",
        "interseccao_pct",
        "p_valor",
        "n_permutacoes",
        "recall_pct",
        "complemento_mb_km2",
        "confiabilidade",
        "validacao_temporal",
        "mapbiomas_colecao",
        "data_comparacao",
    },
}


def validar_campo(tabela: str, campo: str) -> None:
    campos_validos = CAMPOS_CORRIGIVEIS.get(tabela)
    if campos_validos is None:
        raise SystemExit(f"Tabela '{tabela}' não corrigível por este script. Opções: {sorted(CAMPOS_CORRIGIVEIS)}")
    if campo not in campos_validos:
        raise SystemExit(f"Campo '{campo}' não corrigível em '{tabela}'. Opções: {sorted(campos_validos)}")


def campos_faltando_para_correcao(codigo_ibge: str | None, tabela: str | None, campo: str | None, valor_novo: str | None) -> list[str]:
    """Correção é tudo-ou-nada: se qualquer um dos 4 foi passado, os 4 viram
    obrigatórios. Retorna os que faltam (lista vazia = ok)."""
    pares = [("--codigo-ibge", codigo_ibge), ("--tabela", tabela), ("--campo", campo), ("--valor-novo", valor_novo)]
    algum_presente = any(valor for _, valor in pares)
    if not algum_presente:
        return []
    return [nome for nome, valor in pares if not valor]


def coagir_tipo(valor_novo_str: str, valor_atual):
    """Usa o tipo do valor atual (vindo do driver do Postgres) pra decidir
    como interpretar o texto do CLI/workflow_dispatch. Sem valor atual pra
    comparar (coluna NULL), mantém como texto — Postgres reclama alto se o
    tipo não bater, o que é aceitável pra uma correção manual e rara."""
    if valor_atual is None:
        return valor_novo_str
    if isinstance(valor_atual, bool):
        return valor_novo_str.strip().lower() in ("true", "1", "sim", "t")
    if isinstance(valor_atual, date):
        return date.fromisoformat(valor_novo_str)
    if isinstance(valor_atual, int):
        return int(valor_novo_str)
    if isinstance(valor_atual, (Decimal, float)):
        return Decimal(valor_novo_str)
    return valor_novo_str


def serializavel(valor):
    """dados_anteriores/dados_novos são JSONB de auditoria, não dado
    operacional — texto é suficiente e evita o json padrão tropeçar em
    Decimal/date, que não são serializáveis nativamente."""
    return None if valor is None else str(valor)


def buscar_valor_atual(conn, tabela: str, campo: str, codigo_ibge: str, ano: int):
    validar_campo(tabela, campo)
    query = sql.SQL("SELECT {campo} FROM {tabela} WHERE codigo_ibge = %(codigo_ibge)s AND ano = %(ano)s").format(
        campo=sql.Identifier(campo), tabela=sql.Identifier(tabela)
    )
    with conn.cursor() as cur:
        cur.execute(query, {"codigo_ibge": codigo_ibge, "ano": ano})
        linha = cur.fetchone()
    if linha is None:
        raise SystemExit(f"Nenhuma linha em {tabela} pra codigo_ibge={codigo_ibge}, ano={ano} — não há o que corrigir.")
    return linha[0]


def aplicar_correcao(conn, tabela: str, campo: str, codigo_ibge: str, ano: int, valor_novo) -> None:
    validar_campo(tabela, campo)
    query = sql.SQL(
        "UPDATE {tabela} SET {campo} = %(valor_novo)s, atualizado_em = now() WHERE codigo_ibge = %(codigo_ibge)s AND ano = %(ano)s"
    ).format(campo=sql.Identifier(campo), tabela=sql.Identifier(tabela))
    with conn.cursor() as cur:
        cur.execute(query, {"valor_novo": valor_novo, "codigo_ibge": codigo_ibge, "ano": ano})


def registrar_auditoria(
    conn,
    ano_referencia: int,
    descricao: str,
    executado_por: str,
    codigo_ibge: str | None,
    dados_anteriores: dict | None,
    dados_novos: dict | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO auditorias_anuais
                (ano_referencia, codigo_ibge, descricao, executado_por, dados_anteriores, dados_novos)
            VALUES (%(ano_referencia)s, %(codigo_ibge)s, %(descricao)s, %(executado_por)s, %(dados_anteriores)s, %(dados_novos)s)
            """,
            {
                "ano_referencia": ano_referencia,
                "codigo_ibge": codigo_ibge,
                "descricao": descricao,
                "executado_por": executado_por,
                "dados_anteriores": Jsonb(dados_anteriores) if dados_anteriores is not None else None,
                "dados_novos": Jsonb(dados_novos) if dados_novos is not None else None,
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ano", type=int, required=True, help="Ano de referência da auditoria (ex.: 2025).")
    parser.add_argument("--descricao", required=True, help="O que foi conferido/decidido nesta auditoria.")
    parser.add_argument("--executado-por", default="Pedro Lopes de Oliveira")
    parser.add_argument("--codigo-ibge", default=None, help="Só se a correção for de um município específico.")
    parser.add_argument("--tabela", choices=sorted(CAMPOS_CORRIGIVEIS), default=None)
    parser.add_argument("--campo", default=None)
    parser.add_argument("--valor-novo", default=None)
    args = parser.parse_args()

    faltando = campos_faltando_para_correcao(args.codigo_ibge, args.tabela, args.campo, args.valor_novo)
    if faltando:
        raise SystemExit(
            "Pra corrigir um dado, informe os 4 juntos: --codigo-ibge, --tabela, --campo, --valor-novo. "
            f"Faltando: {', '.join(faltando)}"
        )
    corrigindo = bool(args.tabela)

    dados_anteriores = dados_novos = None
    with get_connection() as conn:
        if corrigindo:
            valor_atual = buscar_valor_atual(conn, args.tabela, args.campo, args.codigo_ibge, args.ano)
            valor_novo_tipado = coagir_tipo(args.valor_novo, valor_atual)
            aplicar_correcao(conn, args.tabela, args.campo, args.codigo_ibge, args.ano, valor_novo_tipado)
            dados_anteriores = {args.campo: serializavel(valor_atual)}
            dados_novos = {args.campo: serializavel(valor_novo_tipado)}

        registrar_auditoria(
            conn,
            args.ano,
            args.descricao,
            args.executado_por,
            codigo_ibge=args.codigo_ibge,
            dados_anteriores=dados_anteriores,
            dados_novos=dados_novos,
        )

    if corrigindo:
        print(f"Correção registrada: {args.tabela}.{args.campo} de {dados_anteriores[args.campo]!r} para {dados_novos[args.campo]!r} ({args.codigo_ibge}, {args.ano}).")
    else:
        print(f"Auditoria {args.ano} registrada sem correção — ano_ativo avança pra {args.ano}.")


if __name__ == "__main__":
    main()
