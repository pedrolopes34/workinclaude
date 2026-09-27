"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Confiabilidade } from "@/lib/types";

// Mapa dos 645 municípios (docs/DECISIONS.md seções 6.52 e 6.54). A geometria
// é um arquivo estático pré-projetado (geodata/gerar_mapa_sp.py, malha do
// IBGE) em /public/mapa, baixado e desenhado no navegador: fica em cache e não
// vai duplicada no HTML e no payload de hidratação. Sem biblioteca de mapa.
//
// Camadas: focos de calor (ano anterior completo e ano corrente), mudança na
// vegetação (dNBR mais recente, em % do município) — as três cobrem os 645 —
// e a confiabilidade validada pela pesquisa (só os 63 da amostra). Focos e
// vegetação usam uma escala azul sequencial validada (tokens --mapa-* no
// globals.css) com faixas FIXAS, que não mudam com o dado; a confiabilidade
// usa as cores protegidas dos selos (CLAUDE.md), que só aparecem nela.
interface DadosMapa {
  largura: number;
  altura: number;
  fonte: string;
  areas_km2?: Record<string, number>;
  municipios: Record<string, string>;
}

export interface MunicipioMapa {
  codigoIbge: string;
  nome?: string;
  confiabilidade: Confiabilidade | null;
  focosAnoAnterior: number | null;
  focosAnoAtual: number | null;
  areaDnbrKm2: number | null;
}

export type CamadaMapa = "focos-anterior" | "focos-atual" | "vegetacao" | "confiabilidade";

export const FONTE_MALHA = "Malha municipal: IBGE, via geodata-br (CC0)";

// Classes escritas por extenso: o Tailwind só gera o que aparece no código.
const PREENCHIMENTO_ESCALA = [
  "fill-[var(--mapa-0)]",
  "fill-[var(--mapa-1)]",
  "fill-[var(--mapa-2)]",
  "fill-[var(--mapa-3)]",
  "fill-[var(--mapa-4)]",
  "fill-[var(--mapa-5)]",
];
const AMOSTRA_ESCALA = [
  "bg-[var(--mapa-0)]",
  "bg-[var(--mapa-1)]",
  "bg-[var(--mapa-2)]",
  "bg-[var(--mapa-3)]",
  "bg-[var(--mapa-4)]",
  "bg-[var(--mapa-5)]",
];
const PREENCHIMENTO_CONFIABILIDADE: Record<Confiabilidade, string> = {
  Alta: "fill-verde",
  Média: "fill-verde-claro",
  Baixa: "fill-areia",
  Insuficiente: "fill-stone-400",
};
const AMOSTRA_CONFIABILIDADE: Record<Confiabilidade, string> = {
  Alta: "bg-verde",
  Média: "bg-verde-claro",
  Baixa: "bg-areia border-areia-borda",
  Insuficiente: "bg-stone-400",
};
const SEM_DADO = "fill-[var(--border)]";

// Faixas fixas, escolhidas pela distribuição real de produção (inventário,
// seção 6.54): focos por município têm mediana 1 e p99 31 em 2025.
const FAIXAS_FOCOS = [
  { ate: 0, rotulo: "0" },
  { ate: 2, rotulo: "1–2" },
  { ate: 5, rotulo: "3–5" },
  { ate: 10, rotulo: "6–10" },
  { ate: 20, rotulo: "11–20" },
  { ate: Infinity, rotulo: "21 ou mais" },
];
// Vegetação em % da área do município; sem classe "zero" (escala começa na 1).
const FAIXAS_VEGETACAO = [
  { ate: 5, rotulo: "até 5%" },
  { ate: 10, rotulo: "5–10%" },
  { ate: 20, rotulo: "10–20%" },
  { ate: 40, rotulo: "20–40%" },
  { ate: Infinity, rotulo: "40% ou mais" },
];
const NIVEIS: Confiabilidade[] = ["Alta", "Média", "Baixa", "Insuficiente"];

function faixa<T extends { ate: number }>(faixas: T[], valor: number): number {
  return faixas.findIndex((f) => valor <= f.ate);
}

function percentualVegetacao(m: MunicipioMapa, areas?: Record<string, number>): number | null {
  const area = areas?.[m.codigoIbge];
  if (m.areaDnbrKm2 === null || !area) return null;
  return Math.min(100, (m.areaDnbrKm2 / area) * 100);
}

interface Classificacao {
  classe: string;
  legenda: string; // rótulo da faixa, pra contagem
  texto: string; // o que a dica mostra
}

function classificar(
  camada: CamadaMapa,
  m: MunicipioMapa,
  areas: Record<string, number> | undefined,
  anos: { anterior: number; atual: number }
): Classificacao {
  if (camada === "confiabilidade") {
    return m.confiabilidade
      ? {
          classe: PREENCHIMENTO_CONFIABILIDADE[m.confiabilidade],
          legenda: m.confiabilidade,
          texto: `confiabilidade ${m.confiabilidade} (validada pela pesquisa)`,
        }
      : { classe: SEM_DADO, legenda: "sem-validacao", texto: "ainda não validado pela pesquisa" };
  }
  if (camada === "vegetacao") {
    const pct = percentualVegetacao(m, areas);
    if (pct === null) return { classe: SEM_DADO, legenda: "sem-dado", texto: "sem leitura de satélite" };
    const i = faixa(FAIXAS_VEGETACAO, pct);
    return {
      classe: PREENCHIMENTO_ESCALA[i + 1],
      legenda: FAIXAS_VEGETACAO[i].rotulo,
      texto: `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do município com mudança na vegetação`,
    };
  }
  const anterior = camada === "focos-anterior";
  const valor = anterior ? m.focosAnoAnterior : m.focosAnoAtual;
  const ano = anterior ? anos.anterior : anos.atual;
  if (valor === null) return { classe: SEM_DADO, legenda: "sem-dado", texto: `sem dado de ${ano}` };
  const i = faixa(FAIXAS_FOCOS, valor);
  return {
    classe: PREENCHIMENTO_ESCALA[i],
    legenda: FAIXAS_FOCOS[i].rotulo,
    texto: `${valor} foco${valor === 1 ? "" : "s"} de calor em ${ano}${anterior ? "" : " (até agora)"}`,
  };
}

const CAMADAS: CamadaMapa[] = ["focos-anterior", "focos-atual", "vegetacao", "confiabilidade"];

export const CAMADA_PADRAO: CamadaMapa = "focos-anterior";

interface PropsMapa {
  arquivo: "/mapa/sp.json" | "/mapa/sp-leve.json";
  municipios: MunicipioMapa[];
  anos: { anterior: number; atual: number };
  rotuloVegetacao: string;
}

// Página /mapa: a camada vem da URL (?camada=), pra um link reproduzir a
// mesma visão, e trocar de camada reescreve a URL sem recarregar. Precisa de
// <Suspense> em volta (useSearchParams numa página pré-renderizada).
export function MapaSPComCamadaNaUrl(props: PropsMapa) {
  const params = useSearchParams();
  const camada = CAMADAS.find((c) => c === params.get("camada")) ?? CAMADA_PADRAO;

  function escolher(nova: CamadaMapa) {
    const busca = new URLSearchParams(params.toString());
    busca.set("camada", nova);
    window.history.replaceState(null, "", `?${busca.toString()}`);
  }

  return <MapaSP {...props} camada={camada} aoEscolherCamada={escolher} />;
}

export function MapaSP({
  arquivo,
  municipios,
  anos,
  rotuloVegetacao,
  camada,
  aoEscolherCamada,
}: PropsMapa & {
  camada: CamadaMapa;
  // Com seletor (página /mapa): seletor de camada, links, dica. Sem ele
  // (prévia da home): só o desenho da camada pedida.
  aoEscolherCamada?: (camada: CamadaMapa) => void;
}) {
  const interativo = Boolean(aoEscolherCamada);
  const [dados, setDados] = useState<DadosMapa | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [dica, setDica] = useState<{ x: number; y: number; texto: string } | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controle = new AbortController();
    fetch(arquivo, { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setDados)
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFalhou(true);
      });
    return () => controle.abort();
  }, [arquivo]);

  const classificados = useMemo(() => {
    const porCodigo = new Map<string, Classificacao & { municipio: MunicipioMapa }>();
    for (const m of municipios) {
      porCodigo.set(m.codigoIbge, { ...classificar(camada, m, dados?.areas_km2, anos), municipio: m });
    }
    return porCodigo;
  }, [municipios, camada, dados, anos]);

  const contagem = useMemo(() => {
    const c = new Map<string, number>();
    for (const v of classificados.values()) c.set(v.legenda, (c.get(v.legenda) ?? 0) + 1);
    return c;
  }, [classificados]);

  const legenda =
    camada === "confiabilidade"
      ? [
          ...NIVEIS.map((n) => ({ rotulo: n, amostra: AMOSTRA_CONFIABILIDADE[n], n: contagem.get(n) ?? 0 })),
          { rotulo: "Não validado pela pesquisa", amostra: "bg-[var(--border)]", n: contagem.get("sem-validacao") ?? 0 },
        ]
      : camada === "vegetacao"
        ? FAIXAS_VEGETACAO.map((f, i) => ({ rotulo: f.rotulo, amostra: AMOSTRA_ESCALA[i + 1], n: contagem.get(f.rotulo) ?? 0 }))
        : FAIXAS_FOCOS.map((f, i) => ({ rotulo: f.rotulo, amostra: AMOSTRA_ESCALA[i], n: contagem.get(f.rotulo) ?? 0 }));
  const semDado = contagem.get("sem-dado") ?? 0;

  const titulo = {
    "focos-anterior": `Focos de calor em ${anos.anterior}`,
    "focos-atual": `Focos de calor em ${anos.atual}, até agora`,
    vegetacao: `Mudança na vegetação, ${rotuloVegetacao}`,
    confiabilidade: "Confiabilidade validada pela pesquisa",
  }[camada];
  const descricaoAcessivel = `${titulo}, nos 645 municípios de São Paulo: ${legenda
    .map((l) => `${l.rotulo}: ${l.n}`)
    .join("; ")}${semDado ? `; sem dado: ${semDado}` : ""}.`;

  function aoMoverPonteiro(e: React.PointerEvent<SVGSVGElement>) {
    const alvo = (e.target as Element).closest("[data-codigo]");
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!alvo || !caixa) return setDica(null);
    const item = classificados.get(alvo.getAttribute("data-codigo") ?? "");
    if (!item) return setDica(null);
    setDica({
      x: e.clientX - caixa.left,
      y: e.clientY - caixa.top,
      texto: `${item.municipio.nome ?? item.municipio.codigoIbge}: ${item.texto}`,
    });
  }

  return (
    <div className="space-y-3">
      {interativo && (
        <div role="group" aria-label="Escolher camada do mapa" className="flex flex-wrap gap-1.5">
          {CAMADAS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={camada === c}
              onClick={() => aoEscolherCamada?.(c)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${camada === c ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted hover:text-foreground"}`}
            >
              {
                {
                  "focos-anterior": `Focos ${anos.anterior}`,
                  "focos-atual": `Focos ${anos.atual}`,
                  vegetacao: "Mudança na vegetação",
                  confiabilidade: "Confiabilidade (pesquisa)",
                }[c]
              }
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
          {legenda.map((l) => (
            <li key={l.rotulo} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm border border-border ${l.amostra}`} aria-hidden="true" />
              {l.rotulo} <span className="tabular-nums text-faint">({l.n})</span>
            </li>
          ))}
          {semDado > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-border bg-[var(--border)]" aria-hidden="true" />
              sem dado <span className="tabular-nums text-faint">({semDado})</span>
            </li>
          )}
        </ul>
      </div>

      <div ref={caixaRef} className="relative">
        {!dados ? (
          <div
            role="img"
            aria-label={descricaoAcessivel}
            className={`flex w-full items-center justify-center rounded-xl bg-background text-xs text-faint ${falhou ? "" : "animate-pulse"}`}
            style={{ aspectRatio: "1000 / 669" }}
          >
            {falhou ? "Não foi possível carregar o mapa agora." : null}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${dados.largura} ${dados.altura}`}
            // Versão com links: "group", porque "img" torna os filhos
            // apresentacionais e não pode conter elementos interativos.
            role={interativo ? "group" : "img"}
            aria-label={descricaoAcessivel}
            className="h-auto w-full"
            onPointerMove={interativo ? aoMoverPonteiro : undefined}
            onPointerLeave={interativo ? () => setDica(null) : undefined}
          >
            {Object.entries(dados.municipios).map(([codigo, d]) => {
              const item = classificados.get(codigo);
              const caminho = (
                <path
                  d={d}
                  data-codigo={codigo}
                  className={`${item?.classe ?? SEM_DADO} stroke-[var(--background)] transition-opacity [stroke-width:0.6] ${interativo ? "hover:opacity-75" : ""}`}
                />
              );
              return interativo ? (
                // tabIndex -1 e aria-hidden: 645 paradas de Tab seriam inúteis
                // pra quem navega por teclado — a busca e a lista da página
                // inicial são o caminho acessível pros mesmos municípios.
                <a key={codigo} href={`/municipio/${codigo}`} tabIndex={-1} aria-hidden="true">
                  {caminho}
                </a>
              ) : (
                <g key={codigo}>{caminho}</g>
              );
            })}
          </svg>
        )}
        {dica && (
          <div
            className="pointer-events-none absolute z-10 max-w-60 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-lg"
            style={{ left: dica.x, top: dica.y - 10 }}
          >
            {dica.texto}
          </div>
        )}
      </div>
    </div>
  );
}
