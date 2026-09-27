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

// Paleta dos selos (CLAUDE.md, docs/DECISIONS.md seção 6.55): sem vermelho —
// Baixa areia, Média verde claro, Alta verde. Insuficiente não tem cor (só
// contorno): não é "pior que Baixa", é falta de agrupamento pra comparar.
// Texto escuro fixo (não o --foreground, que clareia no tema escuro).
export const CONFIABILIDADE_STYLE: Record<Confiabilidade, { classe: string; label: string }> = {
  Alta: { classe: "border border-verde bg-verde text-white", label: "Alta" },
  Média: { classe: "border border-verde-claro bg-verde-claro text-stone-900", label: "Média" },
  Baixa: { classe: "border border-areia-borda bg-areia text-stone-900", label: "Baixa" },
  Insuficiente: { classe: "border border-dashed border-faint bg-transparent text-muted", label: "Insuficiente" },
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

// De onde vem cada linha de metricas_anuais (docs/DECISIONS.md seções 6.52
// e 6.53). Conferido no banco de produção (inventário, seção 6.51): as linhas
// de 2024 dos 63 da amostra são exatamente os valores da pesquisa, que são de
// AGOSTO de 2024; 2025 em diante vem do pipeline automático, com o ano
// inteiro. Os dois usam só o satélite de referência do INPE desde o
// reprocessamento da seção 6.53. Enquanto metricas_anuais não tiver uma
// coluna de origem, a regra fica aqui.
export const ANO_DA_PESQUISA = 2024;

export function origemDasMetricas(ano: number, naAmostra: boolean): { periodo: string; origem: string } {
  if (ano === ANO_DA_PESQUISA && naAmostra) {
    return { periodo: "ago/2024", origem: "pesquisa validada" };
  }
  const anoAtual = new Date().getFullYear();
  return {
    periodo: ano === anoAtual ? `${ano}, até agora` : `${ano}, ano inteiro`,
    origem: "cálculo automático, sem conferência manual",
  };
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Janela da leitura de satélite mais recente, a partir da chave da miniatura
// (`dnbr/<código>-<ano>-<mês>.png`, pipeline/run_dnbr.py): o pipeline mensal
// compara o mês anterior inteiro com o mês da chave. Ex.: "ago → set/2026".
export function rotuloJanelaDnbr(urls: (string | null)[]): string {
  let maior: [number, number] | null = null;
  for (const url of urls) {
    const achado = url?.match(/-(\d{4})-(\d{2})\.png$/);
    if (!achado) continue;
    const par: [number, number] = [Number(achado[1]), Number(achado[2])];
    if (!maior || par[0] > maior[0] || (par[0] === maior[0] && par[1] > maior[1])) maior = par;
  }
  if (!maior) return "mais recente";
  const [ano, mes] = maior;
  const anterior = mes === 1 ? `${MESES_CURTOS[11]}/${ano - 1}` : MESES_CURTOS[mes - 2];
  return `${anterior} → ${MESES_CURTOS[mes - 1]}/${ano}`;
}
