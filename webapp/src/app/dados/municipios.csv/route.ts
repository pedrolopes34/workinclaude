import { listarParaExportacao } from "@/lib/queries";
import { ANO_DA_PESQUISA } from "@/lib/format";

// GET /dados/municipios.csv — base completa (docs/DECISIONS.md seção 6.55):
// uma linha por município × ano, com focos, agrupamentos, áreas, parâmetros
// do agrupamento e a comparação com o MapBiomas Fogo, dos 645 municípios.
// Lê direto do banco como o resto do /webapp (CLAUDE.md), sem passar pela
// /api. As colunas de origem dizem de onde vem cada número: "pesquisa" (os 63
// da amostra, ago/2024, conferidos à mão) ou "automatico" (pipeline, mesma
// regra) — quem for analisar precisa separar os dois.
//
// CSV padrão (RFC 4180): vírgula como separador, ponto decimal, UTF-8 com BOM
// pro Excel abrir os acentos certo.
const COLUNAS = [
  "codigo_ibge",
  "municipio",
  "mesorregiao",
  "na_amostra_da_pesquisa",
  "ano",
  "periodo_metricas",
  "origem_metricas",
  "focos_calor",
  "agrupamentos",
  "area_agrupamentos_km2",
  "area_leitura_satelite_km2",
  "raio_agrupamento_km",
  "janela_agrupamento_dias",
  "minimo_focos_agrupamento",
  "confiabilidade",
  "origem_confiabilidade",
  "recall_pct",
  "interseccao_pct",
  "p_valor",
  "n_permutacoes",
  "area_mapbiomas_km2",
  "colecao_mapbiomas",
] as const;

function celula(valor: string | number | boolean | null): string {
  if (valor === null) return "";
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET() {
  const linhas = await listarParaExportacao();
  const anoAtual = new Date().getFullYear();

  const corpo = linhas.map((l) => {
    const temMetricas = l.numFocosCalor !== null || l.areaDnbrKm2 !== null;
    // Período das métricas: agosto nos números da pesquisa; o ano inteiro
    // (ou até a data do processamento, no ano corrente) no cálculo automático.
    const daPesquisa = l.naAmostra && l.ano === ANO_DA_PESQUISA;
    const periodo = daPesquisa ? `${l.ano}-08` : l.ano === anoAtual ? `${l.ano} (parcial)` : String(l.ano);
    return [
      l.codigoIbge,
      l.nome,
      l.mesorregiao,
      l.naAmostra,
      l.ano,
      temMetricas ? periodo : null,
      temMetricas ? (daPesquisa ? "pesquisa" : "automatico") : null,
      l.numFocosCalor,
      l.numAgrupamentos,
      l.areaStDbscanKm2,
      l.areaDnbrKm2,
      l.epsSpaceKm,
      l.epsTimeDays,
      l.minSamples,
      l.confiabilidade,
      l.fonte === null ? null : l.fonte === "manual" ? "pesquisa" : "automatico",
      l.recallPct,
      l.interseccaoPct,
      l.pValor,
      l.nPermutacoes,
      l.areaMapbiomasKm2,
      l.mapbiomasColecao,
    ]
      .map(celula)
      .join(",");
  });

  const csv = `﻿${COLUNAS.join(",")}\r\n${corpo.join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="painel-queimadas-sp.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
