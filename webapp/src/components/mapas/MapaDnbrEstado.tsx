"use client";

import { useRef, useState } from "react";
import type { MosaicoDnbr } from "@/lib/types";
import { MESES_CURTOS, MESES_LONGOS, chaveMes, rotuloMes } from "@/lib/meses";
import { avisoSemLeitura } from "@/lib/mapas";
import { Dica, EsqueletoMapa, FONTE_MALHA, retanguloNoMapa, useMalhaSP } from "./malha";

// Leitura de satélite (dNBR) do estado inteiro num mês (docs/DECISIONS.md
// seção 6.55): o mosaico gerado por pipeline/run_dnbr_estado.py, esticado
// sobre o mesmo desenho dos 645 municípios, com os limites municipais liga/
// desliga. Mesma paleta das miniaturas municipais (verde = sem sinal, até
// preto = dNBR de 0,70 ou mais).

// Onde a imagem do mês não tem pixel (nenhuma cena limpa: nuvem o mês todo),
// aparece a hachura por baixo — sem leitura, e não "sem mudança" (seção 6.57).
const HACHURA = "bg-[repeating-linear-gradient(135deg,var(--faint)_0_1px,transparent_1px_4px)]";

export function LegendaDnbr({ semLeitura = false }: { semLeitura?: boolean }) {
  return (
    <div className="space-y-1">
      <span
        className="block h-2 w-full max-w-72 rounded-full"
        style={{ background: "linear-gradient(to right, green, yellow, orange, red, black)" }}
        aria-hidden="true"
      />
      <div className="flex max-w-72 justify-between text-[11px] text-faint">
        <span>0,10 ou menos</span>
        <span>0,70 ou mais</span>
      </div>
      {semLeitura && (
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <span className={`h-3 w-3 rounded-sm border border-faint ${HACHURA}`} aria-hidden="true" />
          sem leitura (nuvem)
        </p>
      )}
    </div>
  );
}

export function MapaDnbrEstado({
  arquivo,
  mosaicos,
  chave,
  nomes,
  aoEscolherMes,
  limites: limitesIniciais = true,
  compacto = false,
  controles = true,
}: {
  arquivo: "/mapa/sp.json" | "/mapa/sp-leve.json";
  mosaicos: MosaicoDnbr[];
  // "AAAA-MM" do mês mostrado
  chave: string;
  nomes?: Record<string, string>;
  aoEscolherMes?: (chave: string) => void;
  limites?: boolean;
  compacto?: boolean;
  // false na prévia dentro de um link (controle dentro de <a> é HTML inválido)
  controles?: boolean;
}) {
  const { malha, falhou } = useMalhaSP(arquivo);
  const [limites, setLimites] = useState(limitesIniciais);
  const [dica, setDica] = useState<{ x: number; y: number; texto: string } | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const interativo = Boolean(nomes);

  const mosaico = mosaicos.find((m) => chaveMes(m) === chave) ?? mosaicos[mosaicos.length - 1];
  const anos = [...new Set(mosaicos.map((m) => m.ano))].sort((a, b) => b - a);
  const descricao = mosaico
    ? `Leitura de satélite (dNBR) de todo o estado de São Paulo, ${rotuloMes(mosaico)}.`
    : "Leitura de satélite (dNBR) de todo o estado de São Paulo.";

  function aoMoverPonteiro(e: React.PointerEvent<SVGSVGElement>) {
    const alvo = (e.target as Element).closest("[data-codigo]");
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!alvo || !caixa) return setDica(null);
    const codigo = alvo.getAttribute("data-codigo") ?? "";
    setDica({ x: e.clientX - caixa.left, y: e.clientY - caixa.top, texto: nomes?.[codigo] ?? codigo });
  }

  if (!mosaico) {
    return (
      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-foreground">Leitura de satélite</p>
        <div
          className="flex w-full items-center justify-center rounded-xl bg-background px-6 text-center text-xs text-faint"
          style={{ aspectRatio: "1000 / 669" }}
        >
          O mapa estadual da leitura de satélite está sendo gerado mês a mês e aparece aqui em breve.
        </div>
      </div>
    );
  }

  const mesesDoAno = mosaicos.filter((m) => m.ano === mosaico.ano);
  const aviso = avisoSemLeitura(mosaico.coberturaPct);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Leitura de satélite · {rotuloMes(mosaico)}</p>
        {controles && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={limites}
              onChange={(e) => setLimites(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-acento)]"
            />
            Limites dos municípios
          </label>
        )}
      </div>

      {aoEscolherMes && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor="ano-dnbr">
            Ano da leitura de satélite
          </label>
          <select
            id="ano-dnbr"
            value={mosaico.ano}
            onChange={(e) => {
              const ano = Number(e.target.value);
              const doAno = mosaicos.filter((m) => m.ano === ano);
              const mesmoMes = doAno.find((m) => m.mes === mosaico.mes) ?? doAno[doAno.length - 1];
              if (mesmoMes) aoEscolherMes(chaveMes(mesmoMes));
            }}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div role="group" aria-label="Mês" className="flex flex-wrap gap-1">
            {MESES_CURTOS.map((rotulo, i) => {
              const disponivel = mesesDoAno.find((m) => m.mes === i + 1);
              const atual = mosaico.mes === i + 1;
              return (
                <button
                  key={rotulo}
                  type="button"
                  disabled={!disponivel}
                  aria-pressed={atual}
                  onClick={() => disponivel && aoEscolherMes(chaveMes(disponivel))}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    atual
                      ? "border-foreground bg-foreground text-background"
                      : disponivel
                        ? "border-border bg-surface text-muted hover:text-foreground"
                        : "cursor-not-allowed border-transparent text-faint opacity-50"
                  }`}
                >
                  {rotulo}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
              <pattern id="hachura-sem-leitura" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" className="fill-[var(--background)]" />
                <line x1="0" y1="0" x2="0" y2="5" className="stroke-[var(--faint)]" strokeWidth="1.2" />
              </pattern>
            </defs>
            {/* Por baixo da imagem: onde ela é transparente (sem cena limpa no mês), aparece a hachura. */}
            {Object.entries(malha.municipios).map(([codigo, d]) => (
              <path key={`f${codigo}`} d={d} fill="url(#hachura-sem-leitura)" />
            ))}
            {(() => {
              const r = retanguloNoMapa(malha, [mosaico.oeste, mosaico.sul, mosaico.leste, mosaico.norte]);
              return (
                <image
                  href={mosaico.imagemUrl}
                  x={r.x}
                  y={r.y}
                  width={r.largura}
                  height={r.altura}
                  preserveAspectRatio="none"
                  style={{ imageRendering: "auto" }}
                />
              );
            })()}
            {Object.entries(malha.municipios).map(([codigo, d]) => {
              const caminho = (
                <path
                  d={d}
                  data-codigo={codigo}
                  className={`fill-transparent ${
                    limites ? "stroke-[var(--foreground)] [stroke-opacity:0.35] [stroke-width:0.5]" : "stroke-none"
                  } ${interativo ? "hover:fill-[rgba(255,255,255,0.25)]" : ""}`}
                />
              );
              return interativo ? (
                // O clique abre o município no mês do mapa (seção 6.57): o ano
                // no painel e a leitura de satélite daquele mês na consulta.
                <a
                  key={codigo}
                  href={`/municipio/${codigo}?periodo=${mosaico.ano}&ano=${mosaico.ano}&mes=${mosaico.mes}#consulta`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
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

      <LegendaDnbr semLeitura={aviso !== null} />
      {aviso && <p className="text-[11px] font-medium text-muted">{aviso}</p>}
      {!compacto && (
        <p className="text-[11px] text-faint">
          dNBR entre {MESES_LONGOS[(mosaico.mes + 10) % 12]} e {MESES_LONGOS[mosaico.mes - 1]}: quanto mais alto, maior
          a mudança na vegetação. Sentinel-2 (ESA/Copernicus), processado no Google Earth Engine; imagem do estado
          em ~380 m por pixel (os números de cada município vêm do cálculo em 20 m). {FONTE_MALHA}.
        </p>
      )}
    </div>
  );
}
