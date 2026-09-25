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
