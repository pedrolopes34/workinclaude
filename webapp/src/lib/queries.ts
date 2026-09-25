import { sql } from "./db";
import type {
  Municipio,
  MunicipioResumo,
  MunicipioDetalhe,
  MetricasAnuais,
  ValidacaoMapbiomas,
} from "./types";

// Ano mais recente com validacao_mapbiomas por municipio, via DISTINCT ON —
// hoje so existe 2024, mas isso ja fica correto quando houver mais de um ano.
// Sem termo de busca: só a amostra (63 municípios), pra não listar os 645 de
// uma vez na tela inicial. Com termo: busca em todos os 645 pelo nome.
export async function listMunicipios(
  termo?: string
): Promise<MunicipioResumo[]> {
  const busca = termo?.trim() ? `%${termo.trim()}%` : null;

  const rows = await sql<MunicipioResumo[]>`
    SELECT
      m.codigo_ibge,
      m.nome,
      m.mesorregiao,
      m.na_amostra,
      v.confiabilidade,
      v.ano
    FROM municipios m
    LEFT JOIN LATERAL (
      SELECT confiabilidade, ano
      FROM validacao_mapbiomas
      WHERE codigo_ibge = m.codigo_ibge
      ORDER BY ano DESC
      LIMIT 1
    ) v ON true
    WHERE ${busca ? sql`m.nome ILIKE ${busca}` : sql`m.na_amostra`}
    ORDER BY v.confiabilidade IS NULL, m.nome ASC
  `;

  return rows;
}

export async function contarMunicipios(): Promise<{
  total: number;
  naAmostra: number;
}> {
  const [row] = await sql<{ total: number; naAmostra: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE na_amostra)::int AS na_amostra
    FROM municipios
  `;
  return row;
}

export async function getMunicipioDetalhe(
  codigoIbge: string
): Promise<MunicipioDetalhe | null> {
  const [municipio] = await sql<Municipio[]>`
    SELECT codigo_ibge, nome, mesorregiao, area_km2, bioma, na_amostra, grupo_amostra
    FROM municipios
    WHERE codigo_ibge = ${codigoIbge}
  `;

  if (!municipio) return null;

  const metricas = await sql<MetricasAnuais[]>`
    SELECT ano, num_focos_calor, num_agrupamentos, area_st_dbscan_km2, area_dnbr_km2
    FROM metricas_anuais
    WHERE codigo_ibge = ${codigoIbge}
    ORDER BY ano DESC
  `;

  const validacoes = await sql<ValidacaoMapbiomas[]>`
    SELECT ano, area_mapbiomas_km2, interseccao_pct, p_valor, recall_pct,
           complemento_mb_km2, confiabilidade, validacao_temporal, mapbiomas_colecao
    FROM validacao_mapbiomas
    WHERE codigo_ibge = ${codigoIbge}
    ORDER BY ano DESC
  `;

  return { municipio, metricas, validacoes };
}
