"use client";

import { useState } from "react";

// Tile de métrica com "?" expansível — explica o número em linguagem
// simples (princípio do CLAUDE.md), sem poluir a tela por padrão.
// Ideia portada do mockup (docs/DECISIONS.md seção 6.38).
export function InfoTile({
  rotulo,
  valor,
  explicacao,
}: {
  rotulo: string;
  valor: React.ReactNode;
  explicacao: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {rotulo}
        </span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={`O que é ${rotulo}`}
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-border tabular-nums text-[11px] leading-none text-faint hover:border-acento hover:text-acento-texto"
        >
          {aberto ? "–" : "?"}
        </button>
      </div>
      <div className="mt-1.5 tabular-nums text-2xl font-semibold tracking-tight text-foreground">
        {valor}
      </div>
      {aberto && (
        <p className="mt-2.5 border-t border-dashed border-border pt-2.5 text-xs leading-relaxed text-muted">
          {explicacao}
        </p>
      )}
    </div>
  );
}
