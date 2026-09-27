import { listarParaExportacao } from "@/lib/queries";
import { origemDasMetricas } from "@/lib/format";

// GET /dados/municipios.csv — os 645 municípios com o dado validado pela
// pesquisa, pra quem quiser trabalhar com a base tabular (docs/DECISIONS.md
// seção 6.52). Lê direto do banco como o resto do /webapp (CLAUDE.md), sem
// passar pela /api. Só entra o que a interface mostra: a confiabilidade e as
// métricas validadas; os números automáticos ficam de fora (seção 6.51).
//
// CSV padrão (RFC 4180): vírgula como separador, ponto decimal, UTF-8 com BOM
// pro Excel abrir os acentos certo.
const COLUNAS = [
  "codigo_ibge",
  "municipio",
  "mesorregiao",
  "na_amostra",
  "ano_validacao",
  "confiabilidade",
  "recall_pct",
  "interseccao_pct",
  "p_valor",
  "area_mapbiomas_km2",
  "colecao_mapbiomas",
  "periodo_metricas",
  "focos_calor",
  "agrupamentos",
  "area_agrupamentos_km2",
  "area_dnbr_km2",
  "origem",
] as const;

function celula(valor: string | number | boolean | null): string {
  if (valor === null) return "";
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET() {
  const linhas = await listarParaExportacao();

  const corpo = linhas.map((l) => {
    const temValidacao = l.anoValidacao !== null;
    const origem = temValidacao ? origemDasMetricas(l.anoValidacao as number, l.naAmostra) : null;
    return [
      l.codigoIbge,
      l.nome,
      l.mesorregiao,
      l.naAmostra,
      l.anoValidacao,
      l.confiabilidade,
      l.recallPct,
      l.interseccaoPct,
      l.pValor,
      l.areaMapbiomasKm2,
      l.mapbiomasColecao,
      origem?.periodo ?? null,
      l.numFocosCalor,
      l.numAgrupamentos,
      l.areaStDbscanKm2,
      l.areaDnbrKm2,
      origem?.origem ?? null,
    ]
      .map(celula)
      .join(",");
  });

  const csv = `﻿${COLUNAS.join(",")}\r\n${corpo.join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="painel-queimadas-sp-municipios.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
