import { CONFIABILIDADE_STYLE, REGRA_CONFIABILIDADE } from "@/lib/format";
import type { Confiabilidade } from "@/lib/types";

// Selo de confiabilidade com a regra que o define sempre à mão: dica ao
// passar o mouse ou focar pelo teclado, e o texto completo pra leitor de
// tela (docs/DECISIONS.md seção 6.52). Cores dos selos são as protegidas
// do CLAUDE.md (seção 6.55: sem vermelho) — este é o único uso delas, junto
// com o mapa de confiabilidade.
//
// `focavel=false` quando o selo está dentro de um link (lista de busca):
// elemento focável dentro de <a> é HTML inválido, então ali fica só o
// `title` e o texto pra leitor de tela.
//
// Sempre 19px em negrito: é o "texto grande" do WCAG que deixa o branco
// sobre o verde (3,26:1) passar sem mexer nos hex protegidos (seção 6.32).
// Uma versão menor (14px) reprovou no teste de contraste (seção 6.52).
export function SeloConfiabilidade({
  nivel,
  focavel = true,
}: {
  nivel: Confiabilidade;
  focavel?: boolean;
}) {
  const estilo = CONFIABILIDADE_STYLE[nivel];
  const regra = REGRA_CONFIABILIDADE[nivel];
  const selo = (
    <span
      className={`inline-flex rounded-full px-3 py-0.5 text-[19px] font-bold ${estilo.classe}`}
    >
      {estilo.label}
    </span>
  );

  if (!focavel) {
    return (
      <span title={`Confiabilidade ${estilo.label}: ${regra}`} className="inline-flex shrink-0">
        {selo}
        <span className="sr-only">: {regra}</span>
      </span>
    );
  }

  return (
    <span
      tabIndex={0}
      className="group relative inline-flex shrink-0 rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-acento"
    >
      {selo}
      <span className="sr-only">: {regra}</span>
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-3 text-left text-xs font-normal leading-relaxed text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
      >
        <strong className="text-foreground">Confiabilidade {estilo.label}.</strong> {regra}
      </span>
    </span>
  );
}
