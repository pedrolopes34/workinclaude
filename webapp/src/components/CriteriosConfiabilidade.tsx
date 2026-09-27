import { LIMIAR_P_VALOR, LIMIAR_RECALL_PCT, formatPct, formatPValor } from "@/lib/format";
import type { Confiabilidade } from "@/lib/types";

// Os dois critérios que decidem a confiabilidade, cada um contra o seu
// limiar — é isso que justifica o selo (docs/DECISIONS.md seção 6.52).
// Substitui a ideia de um gráfico "INPE × MapBiomas" lado a lado: áreas
// com definições diferentes não precisam ser iguais, e a regra não compara
// áreas. Passou/não passou vai em texto e símbolo, não só em cor.
function Criterio({
  titulo,
  valor,
  passou,
  barra,
  explicacao,
}: {
  titulo: string;
  valor: string;
  passou: boolean | null;
  barra?: { pct: number; limiarPct: number };
  explicacao: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{titulo}</span>
        <span className="text-xs text-foreground">
          <span className="tabular-nums font-semibold">{valor}</span>
          {passou !== null && (
            <span className="ml-2 font-semibold">{passou ? "✓ passou" : "✗ não passou"}</span>
          )}
        </span>
      </div>
      {barra && (
        <div className="relative h-2.5 overflow-hidden rounded-full border border-border bg-background" aria-hidden="true">
          <div className="h-full rounded-full bg-acento" style={{ width: `${Math.min(100, Math.max(0, barra.pct))}%` }} />
          <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${barra.limiarPct}%` }} />
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-faint">{explicacao}</p>
    </div>
  );
}

export function CriteriosConfiabilidade({
  confiabilidade,
  recallPct,
  pValor,
}: {
  confiabilidade: Confiabilidade;
  recallPct: string | null;
  pValor: string | null;
}) {
  if (confiabilidade === "Insuficiente") {
    return (
      <p className="text-xs text-muted">
        Nenhum agrupamento de focos se formou neste ano, então os dois critérios não se aplicam.
      </p>
    );
  }

  const recall = recallPct === null ? null : Number(recallPct);
  const p = pValor === null ? null : Number(pValor);

  return (
    <div className="space-y-4">
      <Criterio
        titulo={`Critério 1 · Recall de pelo menos ${LIMIAR_RECALL_PCT}%`}
        valor={formatPct(recallPct)}
        passou={recall === null ? null : recall >= LIMIAR_RECALL_PCT}
        barra={recall === null ? undefined : { pct: recall, limiarPct: LIMIAR_RECALL_PCT }}
        explicacao="A linha vertical marca 50%. A barra é a parte da área queimada do MapBiomas que caiu dentro dos agrupamentos de focos."
      />
      <Criterio
        titulo="Critério 2 · valor-p abaixo de 0,05"
        valor={formatPValor(pValor)}
        passou={p === null ? null : p < LIMIAR_P_VALOR}
        explicacao="Abaixo de 0,05, a coincidência entre agrupamentos e MapBiomas dificilmente sairia por acaso (teste de permutação)."
      />
    </div>
  );
}
