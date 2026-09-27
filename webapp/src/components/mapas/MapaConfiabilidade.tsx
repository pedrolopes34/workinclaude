"use client";

import { useMemo, useRef, useState } from "react";
import type { Confiabilidade } from "@/lib/types";
import { Dica, EsqueletoMapa, FONTE_MALHA, useMalhaSP } from "./malha";

// Mapa da confiabilidade dos 645 municípios num ano (docs/DECISIONS.md seção
// 6.55): a da pesquisa nos 63 da amostra (agosto de 2024) e a do cálculo
// automático, com a mesma regra, nos demais (ano inteiro). Cores dos selos
// (CLAUDE.md): Alta verde, Média verde claro, Baixa areia; Insuficiente sem
// cor, com hachura — não é "pior que Baixa", é falta de agrupamento pra
// comparar. A origem aparece na dica de cada município.

export interface ConfiabilidadeMunicipio {
  nivel: Confiabilidade;
  interseccao: number | null;
  pesquisa: boolean;
}

// ano -> código IBGE -> classificação
export type ConfiabilidadePorAno = Record<number, Record<string, ConfiabilidadeMunicipio>>;

export const NIVEIS: Confiabilidade[] = ["Alta", "Média", "Baixa", "Insuficiente"];

// Classes por extenso: o Tailwind só gera o que aparece no código.
const PREENCHIMENTO: Record<Exclude<Confiabilidade, "Insuficiente">, string> = {
  Alta: "fill-verde",
  Média: "fill-verde-claro",
  Baixa: "fill-areia",
};
export const AMOSTRA_LEGENDA: Record<Confiabilidade, string> = {
  Alta: "bg-verde border-verde",
  Média: "bg-verde-claro border-verde-claro",
  Baixa: "bg-areia border-areia-borda",
  Insuficiente: "border-dashed border-faint bg-[repeating-linear-gradient(135deg,var(--faint)_0_1px,transparent_1px_4px)]",
};

function formatarInterseccao(valor: number | null): string {
  return valor === null
    ? "—"
    : `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function MapaConfiabilidade({
  arquivo,
  porAno,
  ano,
  nomes,
  aoEscolherAno,
  compacto = false,
}: {
  arquivo: "/mapa/sp.json" | "/mapa/sp-leve.json";
  porAno: ConfiabilidadePorAno;
  ano: number;
  // Com nomes: dica ao passar o mouse e clique abre o município.
  nomes?: Record<string, string>;
  // Com seletor: troca de ano (página /mapa).
  aoEscolherAno?: (ano: number) => void;
  compacto?: boolean;
}) {
  const { malha, falhou } = useMalhaSP(arquivo);
  const [dica, setDica] = useState<{ x: number; y: number; texto: string } | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const interativo = Boolean(nomes);
  const anos = Object.keys(porAno)
    .map(Number)
    .sort((a, b) => b - a);
  const doAno = useMemo(() => porAno[ano] ?? {}, [porAno, ano]);

  const contagem = useMemo(() => {
    const c: Record<Confiabilidade | "sem", number> = { Alta: 0, Média: 0, Baixa: 0, Insuficiente: 0, sem: 0 };
    for (const codigo of Object.keys(malha?.municipios ?? {})) {
      const item = doAno[codigo];
      c[item ? item.nivel : "sem"] += 1;
    }
    return c;
  }, [malha, doAno]);

  const descricao = `Confiabilidade em ${ano} nos 645 municípios de São Paulo: ${NIVEIS.map(
    (n) => `${n} ${contagem[n]}`
  ).join(", ")}${contagem.sem ? `, sem classificação ${contagem.sem}` : ""}.`;

  function aoMoverPonteiro(e: React.PointerEvent<SVGSVGElement>) {
    const alvo = (e.target as Element).closest("[data-codigo]");
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!alvo || !caixa) return setDica(null);
    const codigo = alvo.getAttribute("data-codigo") ?? "";
    const item = doAno[codigo];
    const nome = nomes?.[codigo] ?? codigo;
    setDica({
      x: e.clientX - caixa.left,
      y: e.clientY - caixa.top,
      texto: item
        ? `${nome}: ${item.nivel}${item.nivel === "Insuficiente" ? "" : ` · Interseção ${formatarInterseccao(item.interseccao)}`} · ${
            item.pesquisa ? `agosto de ${ano}, pesquisa` : `${ano} inteiro, cálculo automático`
          }`
        : `${nome}: sem classificação em ${ano}`,
    });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Confiabilidade · {ano}</p>
        {aoEscolherAno && anos.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted">
            Ano
            <select
              value={ano}
              onChange={(e) => aoEscolherAno(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
            >
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <ul className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted ${compacto ? "" : "sm:gap-x-4"}`}>
        {NIVEIS.map((n) => (
          <li key={n} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm border ${AMOSTRA_LEGENDA[n]}`} aria-hidden="true" />
            {n} <span className="tabular-nums text-faint">({contagem[n]})</span>
          </li>
        ))}
        {contagem.sem > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-border bg-[var(--border)]" aria-hidden="true" />
            sem classificação <span className="tabular-nums text-faint">({contagem.sem})</span>
          </li>
        )}
      </ul>

      <div ref={caixaRef} className="relative">
        {!malha ? (
          <EsqueletoMapa falhou={falhou} rotulo={descricao} />
        ) : (
          <svg
            viewBox={`0 0 ${malha.largura} ${malha.altura}`}
            role={interativo ? "group" : "img"}
            aria-label={descricao}
            className="h-auto w-full"
            onPointerMove={interativo ? aoMoverPonteiro : undefined}
            onPointerLeave={interativo ? () => setDica(null) : undefined}
          >
            <defs>
              <pattern id="hachura-insuficiente" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--surface)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--faint)" strokeWidth="1.2" />
              </pattern>
            </defs>
            {Object.entries(malha.municipios).map(([codigo, d]) => {
              const item = doAno[codigo];
              const classe = !item
                ? "fill-[var(--border)]"
                : item.nivel === "Insuficiente"
                  ? ""
                  : PREENCHIMENTO[item.nivel];
              const caminho = (
                <path
                  d={d}
                  data-codigo={codigo}
                  fill={item?.nivel === "Insuficiente" ? "url(#hachura-insuficiente)" : undefined}
                  className={`${classe} stroke-[var(--mapa-contorno)] [stroke-width:0.6] ${interativo ? "hover:opacity-75" : ""}`}
                />
              );
              return interativo ? (
                // tabIndex -1 e aria-hidden: 645 paradas de Tab seriam inúteis;
                // a busca e a lista por nível são o caminho acessível.
                <a key={codigo} href={`/municipio/${codigo}`} tabIndex={-1} aria-hidden="true">
                  {caminho}
                </a>
              ) : (
                <g key={codigo}>{caminho}</g>
              );
            })}
          </svg>
        )}
        <Dica dica={dica} />
      </div>
      {!compacto && <p className="text-[11px] text-faint">{FONTE_MALHA}.</p>}
    </div>
  );
}
