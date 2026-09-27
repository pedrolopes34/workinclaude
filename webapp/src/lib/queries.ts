import { cache } from "react";
import { sql } from "./db";
import { urlPublicaDnbr } from "./imagensR2";
import type {
  Confiabilidade,
  ContagemConfiabilidade,
  Municipio,
  MunicipioResumo,
  MunicipioDetalhe,
  MunicipioNoMapa,
  MetricasAnuais,
  ResumoCobertura,
  ValidacaoMapbiomas,
} from "./types";

export const NIVEIS_CONFIABILIDADE: Confiabilidade[] = ["Alta", "Média", "Baixa", "Insuficiente"];

// A interface só mostra a confiabilidade validada pela pesquisa
// (fonte = 'manual', os 63 da amostra). As 516 automáticas de 2024 estão no
// banco, mas usam focos de TODOS os satélites do INPE, e a pesquisa usa só o
// satélite de referência (docs/DECISIONS.md seção 6.51). A página do
// município já as tratava como "não comparado/validado"; a busca mostrava o
// selo delas mesmo assim, e essa inconsistência foi corrigida (seção 6.52).
const confiabilidadeValidada = sql`
  LEFT JOIN LATERAL (
    SELECT confiabilidade, ano
    FROM validacao_mapbiomas
    WHERE codigo_ibge = m.codigo_ibge AND fonte = 'manual'
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

// Sem termo e sem filtro: só a amostra (63), pra não despejar os 645 na tela
// inicial. Com termo: busca nos 645 pelo nome ou pelo código IBGE (2 a 7
// dígitos, casando pelo começo). O filtro por nível vale só pra confiabilidade
// validada pela pesquisa.
export async function listMunicipios(
  termo?: string,
  nivel?: Confiabilidade
): Promise<MunicipioResumo[]> {
  const t = termo?.trim() ?? "";
  const porCodigo = /^\d{2,7}$/.test(t);
  const filtroBusca = !t
    ? nivel
      ? sql`true`
      : sql`m.na_amostra`
    : porCodigo
      ? sql`m.codigo_ibge LIKE ${`${t}%`}`
      : sql`lower(translate(m.nome, ${ACENTUADAS}, ${SEM_ACENTO})) LIKE ${`%${normalizarBusca(t)}%`}`;
  const filtroNivel = nivel ? sql`v.confiabilidade = ${nivel}` : sql`true`;

  return sql<MunicipioResumo[]>`
    SELECT m.codigo_ibge, m.nome, m.mesorregiao, m.na_amostra, v.confiabilidade, v.ano
    FROM municipios m
    ${confiabilidadeValidada}
    WHERE ${filtroBusca} AND ${filtroNivel}
    ORDER BY v.confiabilidade IS NULL, m.nome ASC
  `;
}

export async function contarPorConfiabilidade(): Promise<ContagemConfiabilidade> {
  const linhas = await sql<{ confiabilidade: Confiabilidade; total: number }[]>`
    SELECT v.confiabilidade, count(*)::int AS total
    FROM municipios m
    ${confiabilidadeValidada}
    WHERE v.confiabilidade IS NOT NULL
    GROUP BY v.confiabilidade
  `;
  const contagem: ContagemConfiabilidade = { Alta: 0, Média: 0, Baixa: 0, Insuficiente: 0 };
  for (const l of linhas) contagem[l.confiabilidade] = l.total;
  return contagem;
}

// Os 645, pro mapa estadual, o autocompletar da busca e a comparação. Focos
// do ano anterior (completo) e do ano corrente (até agora) vêm do pipeline
// automático, que desde a seção 6.53 usa só o satélite de referência; a área
// de leitura de satélite é a da miniatura dNBR mais recente. Nunca usa as
// linhas de 2024, que na amostra são os números da pesquisa (ago/2024).
export const listarMunicipiosNoMapa = cache(async function listarMunicipiosNoMapa(): Promise<
  MunicipioNoMapa[]
> {
  const anoAtual = new Date().getFullYear();
  return sql<MunicipioNoMapa[]>`
    SELECT m.codigo_ibge, m.nome, v.confiabilidade,
           fa.num_focos_calor AS focos_ano_anterior,
           fb.num_focos_calor AS focos_ano_atual,
           d.area_dnbr_km2, d.dnbr_imagem_url
    FROM municipios m
    ${confiabilidadeValidada}
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

  // Só a validação da pesquisa (seção 6.52) — ver confiabilidadeValidada.
  const validacoes = await sql<ValidacaoMapbiomas[]>`
    SELECT ano, area_mapbiomas_km2, interseccao_pct, p_valor, recall_pct,
           complemento_mb_km2, confiabilidade, validacao_temporal, mapbiomas_colecao,
           fonte, n_permutacoes
    FROM validacao_mapbiomas
    WHERE codigo_ibge = ${codigoIbge} AND fonte = 'manual'
    ORDER BY ano DESC
  `;

  return { municipio, metricas, validacoes };
});

// Linha por município pro CSV: dado validado da pesquisa (confiabilidade e
// critérios de ago/2024 + focos/agrupamentos/áreas do mesmo recorte). Os
// números automáticos ficam de fora pelo mesmo motivo de confiabilidadeValidada.
export interface LinhaExportacao {
  codigoIbge: string;
  nome: string;
  mesorregiao: string | null;
  naAmostra: boolean;
  anoValidacao: number | null;
  confiabilidade: Confiabilidade | null;
  recallPct: string | null;
  interseccaoPct: string | null;
  pValor: string | null;
  areaMapbiomasKm2: string | null;
  mapbiomasColecao: string | null;
  numFocosCalor: number | null;
  numAgrupamentos: number | null;
  areaStDbscanKm2: string | null;
  areaDnbrKm2: string | null;
}

export async function listarParaExportacao(): Promise<LinhaExportacao[]> {
  return sql<LinhaExportacao[]>`
    SELECT m.codigo_ibge, m.nome, m.mesorregiao, m.na_amostra,
           v.ano AS ano_validacao, v.confiabilidade, v.recall_pct, v.interseccao_pct, v.p_valor,
           v.area_mapbiomas_km2, v.mapbiomas_colecao,
           mt.num_focos_calor, mt.num_agrupamentos, mt.area_st_dbscan_km2, mt.area_dnbr_km2
    FROM municipios m
    LEFT JOIN LATERAL (
      SELECT ano, confiabilidade, recall_pct, interseccao_pct, p_valor, area_mapbiomas_km2, mapbiomas_colecao
      FROM validacao_mapbiomas
      WHERE codigo_ibge = m.codigo_ibge AND fonte = 'manual'
      ORDER BY ano DESC
      LIMIT 1
    ) v ON true
    LEFT JOIN metricas_anuais mt
      ON mt.codigo_ibge = m.codigo_ibge AND mt.ano = v.ano AND m.na_amostra
    ORDER BY m.nome
  `;
}
