import type { Confiabilidade } from "./types";

export function formatPct(value: string | number | null, casas = 1): string {
  if (value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

export function formatKm2(value: string | number | null): string {
  if (value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km²`;
}

export function formatPValor(value: string | number | null): string {
  if (value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

// Alta/verde = confiavel; Media/mostarda e Baixa/terracota reaproveitam a
// paleta de alerta ja fechada (CLAUDE.md); Insuficiente = neutro, nao e alerta.
export const CONFIABILIDADE_STYLE: Record<
  Confiabilidade,
  { bg: string; text: string; label: string }
> = {
  Alta: { bg: "bg-verde", text: "text-white", label: "Alta" },
  Média: { bg: "bg-mostarda", text: "text-stone-900", label: "Média" },
  Baixa: { bg: "bg-terracota", text: "text-white", label: "Baixa" },
  Insuficiente: { bg: "bg-stone-200", text: "text-stone-600", label: "Insuficiente" },
};

// Regra fixa da confiabilidade (CLAUDE.md) em linguagem simples — usada no
// selo (tooltip), na página do município e em Como produzimos.
export const LIMIAR_RECALL_PCT = 50;
export const LIMIAR_P_VALOR = 0.05;

export const REGRA_CONFIABILIDADE: Record<Confiabilidade, string> = {
  Alta: "Os dois critérios passaram: Recall de pelo menos 50% e valor-p abaixo de 0,05.",
  Média: "Só um dos dois critérios passou (Recall de pelo menos 50% ou valor-p abaixo de 0,05).",
  Baixa: "Houve agrupamento de focos no ano, mas nenhum dos dois critérios passou.",
  Insuficiente: "Nenhum agrupamento de focos se formou no ano, então não há o que comparar.",
};

export function formatData(valor: Date | string | null): string {
  if (!valor) return "—";
  const data = typeof valor === "string" ? new Date(valor) : valor;
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// De onde vem cada linha de metricas_anuais (docs/DECISIONS.md seção 6.52).
// Conferido no banco de produção (inventário, seção 6.51): as linhas de 2024
// dos 63 da amostra são exatamente os valores da pesquisa, que são de AGOSTO
// de 2024 com o satélite de referência do INPE; 2025 em diante vem do
// pipeline automático, com o ano inteiro e todos os satélites. Enquanto
// metricas_anuais não tiver uma coluna de origem, a regra fica aqui.
export const ANO_DA_PESQUISA = 2024;

export function origemDasMetricas(ano: number, naAmostra: boolean): { periodo: string; origem: string } {
  if (ano === ANO_DA_PESQUISA && naAmostra) {
    return { periodo: "ago/2024", origem: "pesquisa validada · satélite de referência do INPE" };
  }
  const anoAtual = new Date().getFullYear();
  return {
    periodo: ano === anoAtual ? `${ano}, até agora` : `${ano}, ano inteiro`,
    origem: "cálculo automático · todos os satélites do INPE",
  };
}
