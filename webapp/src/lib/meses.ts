// Rótulos de mês (docs/DECISIONS.md seção 6.55) — fora de componente de
// cliente pra poder ser usado também nas páginas do servidor.
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function chaveMes(m: { ano: number; mes: number }): string {
  return `${m.ano}-${String(m.mes).padStart(2, "0")}`;
}

export function rotuloMes(m: { ano: number; mes: number }): string {
  return `${MESES_LONGOS[m.mes - 1]} de ${m.ano}`;
}
