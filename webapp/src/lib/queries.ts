import { cache } from "react";
import { sql } from "./db";
import { urlPublicaDnbr, urlPublicaR2 } from "./imagensR2";
import type {
  Confiabilidade,
  ConfiabilidadeNoAno,
  ContagemConfiabilidade,
  Municipio,
  MunicipioResumo,
  MunicipioDetalhe,
  MunicipioNoMapa,
  MetricasAnuais,
  MosaicoDnbr,
  ResumoCobertura,
  ValidacaoMapbiomas,
} from "./types";

export const NIVEIS_CONFIABILIDADE: Confiabilidade[] = ["Alta", "Média", "Baixa", "Insuficiente"];

// Confiabilidade de cada município = a do ano mais recente comparado ao
// MapBiomas (docs/DECISIONS.md seção 6.55). Por município × ano existe uma
// linha só: a da pesquisa (fonte 'manual', os 63 da amostra, ago/2024) ou a
// do cálculo automático com a mesma regra (os demais, ano inteiro) — o
// pipeline nunca grava automático onde há linha da pesquisa (seção 6.29).
const ultimaValidacao = sql`
  LEFT JOIN LATERAL (
    SELECT ano, confiabilidade, interseccao_pct, fonte
    FROM validacao_mapbiomas
    WHERE codigo_ibge = m.codigo_ibge
    ORDER BY ano DESC
    LIMIT 1
  ) v ON true
`;

// Busca sem depender de acento nem de caixa ("olimpia" acha "Olímpia",
// "aguas" acha "Águas de Lindóia"). Maiúsculas acentuadas entram no
// translate porque, com locale C, o lower() do Postgres só converte ASCII —
// por isso a ordem é translate primeiro, lower depois.
const ACENTUADAS = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";

export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// Sem termo: os 645 (a página inicial agrupa por nível). Com termo: busca
// pelo nome ou pelo código IBGE (2 a 7 dígitos, casando pelo começo).
export async function listMunicipios(
  termo?: string,
  nivel?: Confiabilidade
): Promise<MunicipioResumo[]> {
  const t = termo?.trim() ?? "";
  const porCodigo = /^\d{2,7}$/.test(t);
  const filtroBusca = !t
    ? sql`true`
    : porCodigo
      ? sql`m.codigo_ibge LIKE ${`${t}%`}`
      : sql`lower(translate(m.nome, ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${`%${normalizarBusca(t)}%`}`;
  const filtroNivel = nivel ? sql`v.confiabilidade = ${nivel}` : sql`true`;

  return sql<MunicipioResumo[]>`
    SELECT m.codigo_ibge, m.nome, m.mesorregiao, m.na_amostra,
           v.confiabilidade, v.interseccao_pct, v.fonte, v.ano
    FROM municipios m
    ${ultimaValidacao}
    WHERE ${filtroBusca} AND ${filtroNivel}
    ORDER BY v.confiabilidade IS NULL, m.nome ASC
  `;
}

export async function contarPorConfiabilidade(): Promise<ContagemConfiabilidade> {
  const linhas = await sql<{ confiabilidade: Confiabilidade; total: number }[]>`
    SELECT v.confiabilidade, count(*)::int AS total
    FROM municipios m
    ${ultimaValidacao}
    WHERE v.confiabilidade IS NOT NULL
    GROUP BY v.confiabilidade
  `;
  const contagem: ContagemConfiabilidade = { Alta: 0, Média: 0, Baixa: 0, Insuficiente: 0 };
  for (const l of linhas) contagem[l.confiabilidade] = l.total;
  return contagem;
}

// Todas as comparações com o MapBiomas (município × ano), pro mapa de
// confiabilidade com seletor de ano.
export const listarConfiabilidadePorAno = cache(async function listarConfiabilidadePorAno(): Promise<
  ConfiabilidadeNoAno[]
> {
  return sql<ConfiabilidadeNoAno[]>`
    SELECT codigo_ibge, ano::int, confiabilidade, interseccao_pct, fonte
    FROM validacao_mapbiomas
    ORDER BY ano, codigo_ibge
  `;
});

// Os 645, pro mapa estadual, o autocompletar da busca e a comparação. Focos
// do ano anterior (completo) e do ano corrente (até agora) vêm do pipeline
// automático, que desde a seção 6.53 usa só o satélite de referência; a área
// de leitura de satélite é a da miniatura dNBR mais recente.
export const listarMunicipiosNoMapa = cache(async function listarMunicipiosNoMapa(): Promise<
  MunicipioNoMapa[]
> {
  const anoAtual = new Date().getFullYear();
  return sql<MunicipioNoMapa[]>`
    SELECT m.codigo_ibge, m.nome, v.confiabilidade, v.interseccao_pct,
           v.ano AS ano_confiabilidade, v.fonte AS fonte_confiabilidade,
           fa.num_focos_calor AS focos_ano_anterior,
           fb.num_focos_calor AS focos_ano_atual,
           d.area_dnbr_km2, d.dnbr_imagem_url
    FROM municipios m
    ${ultimaValidacao}
    LEFT JOIN metricas_anuais fa ON fa.codigo_ibge = m.codigo_ibge AND fa.ano = ${anoAtual - 1}
    LEFT JOIN metricas_anuais fb ON fb.codigo_ibge = m.codigo_ibge AND fb.ano = ${anoAtual}
    LEFT JOIN LATERAL (
      SELECT area_dnbr_km2, dnbr_imagem_url
      FROM metricas_anuais
      WHERE codigo_ibge = m.codigo_ibge AND dnbr_imagem_url IS NOT NULL
      ORDER BY ano DESC
      LIMIT 1
    ) d ON true
    ORDER BY m.nome
  `;
});

// Meses com mosaico estadual de leitura de satélite. A tabela nasce na
// primeira rodada de run_dnbr_estado.py — antes disso, lista vazia.
export const listarMosaicos = cache(async function listarMosaicos(): Promise<MosaicoDnbr[]> {
  const [existe] = await sql<{ existe: boolean }[]>`SELECT to_regclass('mosaicos_dnbr') IS NOT NULL AS existe`;
  if (!existe?.existe) return [];
  const linhas = await sql<MosaicoDnbr[]>`
    SELECT ano::int, mes::int, imagem_url, oeste, sul, leste, norte, colecao
    FROM mosaicos_dnbr
    ORDER BY ano, mes
  `;
  return linhas.map((l) => ({ ...l, imagemUrl: urlPublicaR2(l.imagemUrl) ?? l.imagemUrl }));
});

export async function getResumoCobertura(): Promise<ResumoCobertura> {
  const [linha] = await sql<ResumoCobertura[]>`
    SELECT
      (SELECT count(*)::int FROM municipios) AS total,
      (SELECT count(*) FILTER (WHERE na_amostra)::int FROM municipios) AS na_amostra,
      (SELECT count(DISTINCT codigo_ibge)::int FROM metricas_anuais WHERE dnbr_imagem_url IS NOT NULL) AS com_mapa_dnbr,
      (SELECT max(atualizado_em) FROM metricas_anuais) AS ultima_atualizacao
  `;
  return linha;
}

export async function municipioExiste(codigoIbge: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM municipios WHERE codigo_ibge = ${codigoIbge}`;
  return row !== undefined;
}

// cache() memoiza por requisicao — generateMetadata e a page chamam esta
// funcao com o mesmo codigoIbge e reaproveitam a mesma consulta ao banco.
export const getMunicipioDetalhe = cache(async function getMunicipioDetalhe(
  codigoIbge: string
): Promise<MunicipioDetalhe | null> {
  const [municipio] = await sql<Municipio[]>`
    SELECT codigo_ibge, nome, mesorregiao, area_km2, bioma, na_amostra, grupo_amostra
    FROM municipios
    WHERE codigo_ibge = ${codigoIbge}
  `;

  if (!municipio) return null;

  const linhasMetricas = await sql<MetricasAnuais[]>`
    SELECT ano, num_focos_calor, num_agrupamentos, area_st_dbscan_km2, area_dnbr_km2,
           dnbr_imagem_url, eps_space_km, eps_time_days, min_samples
    FROM metricas_anuais
    WHERE codigo_ibge = ${codigoIbge}
    ORDER BY ano DESC
  `;
  const metricas = linhasMetricas.map((m) => ({ ...m, dnbrImagemUrl: urlPublicaDnbr(m.dnbrImagemUrl) }));

  // Da pesquisa e automáticas (seção 6.55) — a página diz a origem de cada uma.
  const validacoes = await sql<ValidacaoMapbiomas[]>`
    SELECT ano, area_mapbiomas_km2, interseccao_pct, p_valor, recall_pct,
           complemento_mb_km2, confiabilidade, validacao_temporal, mapbiomas_colecao,
           fonte, n_permutacoes
    FROM validacao_mapbiomas
    WHERE codigo_ibge = ${codigoIbge}
    ORDER BY ano DESC
  `;

  return { municipio, metricas, validacoes };
});

// CSV completo (seção 6.55): uma linha por município × ano, com tudo o que
// existe — focos, agrupamentos, áreas, parâmetros do agrupamento e a
// comparação com o MapBiomas —, e a origem de cada número.
export interface LinhaExportacao {
  codigoIbge: string;
  nome: string;
  mesorregiao: string | null;
  naAmostra: boolean;
  ano: number;
  numFocosCalor: number | null;
  numAgrupamentos: number | null;
  areaStDbscanKm2: string | null;
  areaDnbrKm2: string | null;
  epsSpaceKm: string | null;
  epsTimeDays: string | null;
  minSamples: number | null;
  confiabilidade: Confiabilidade | null;
  fonte: "manual" | "automatico" | null;
  recallPct: string | null;
  interseccaoPct: string | null;
  pValor: string | null;
  areaMapbiomasKm2: string | null;
  mapbiomasColecao: string | null;
  nPermutacoes: number | null;
}

export async function listarParaExportacao(): Promise<LinhaExportacao[]> {
  return sql<LinhaExportacao[]>`
    WITH anos AS (
      SELECT codigo_ibge, ano FROM metricas_anuais
      UNION
      SELECT codigo_ibge, ano FROM validacao_mapbiomas
    )
    SELECT m.codigo_ibge, m.nome, m.mesorregiao, m.na_amostra, a.ano::int,
           mt.num_focos_calor, mt.num_agrupamentos, mt.area_st_dbscan_km2, mt.area_dnbr_km2,
           mt.eps_space_km, mt.eps_time_days, mt.min_samples,
           v.confiabilidade, v.fonte, v.recall_pct, v.interseccao_pct, v.p_valor,
           v.area_mapbiomas_km2, v.mapbiomas_colecao, v.n_permutacoes
    FROM anos a
    JOIN municipios m ON m.codigo_ibge = a.codigo_ibge
    LEFT JOIN metricas_anuais mt ON mt.codigo_ibge = a.codigo_ibge AND mt.ano = a.ano
    LEFT JOIN validacao_mapbiomas v ON v.codigo_ibge = a.codigo_ibge AND v.ano = a.ano
    ORDER BY m.nome, a.ano
  `;
}
