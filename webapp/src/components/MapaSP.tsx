"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FocosPorAno } from "@/lib/mapas";

// Mapa dos focos de calor por município (docs/DECISIONS.md seções 6.52, 6.54,
// 6.55 e 6.57). A geometria é um arquivo estático pré-projetado
// (geodata/gerar_mapa_sp.py, malha do IBGE) em /public/mapa, baixado e
// desenhado no navegador: fica em cache e não vai duplicada no HTML e no
// payload de hidratação. Sem biblioteca de mapa.
//
// Um ano por vez, de 2018 ao ano corrente (pedido do Pedro, seção 6.57), nos
// 645, numa escala azul sequencial validada (tokens --mapa-* no globals.css)
// com faixas FIXAS, que não mudam de um ano para o outro — num ano ruim, mais
// municípios caem na faixa de cima, e isso é a informação. O clique abre o
// município no ano escolhido.
interface DadosMapa {
  largura: number;
  altura: number;
  fonte: string;
  areas_km2?: Record<string, number>;
  municipios: Record<string, string>;
}

export const FONTE_MALHA = "Malha municipal: IBGE, via geodata-br (CC0)";
// Ano em que a linha dos 63 da amostra é a da pesquisa: só agosto.
const ANO_DA_PESQUISA = 2024;

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
const SEM_DADO = "fill-[var(--border)]";

// Faixas fixas, escolhidas pela distribuição real de produção (inventário,
// seções 6.54 e 6.57): a mediana de focos por município vai de 1 (2022, 2023,
// 2025) a 6 (2024); o p90, de 6 a 28.
const FAIXAS_FOCOS = [
  { ate: 0, rotulo: "0" },
  { ate: 2, rotulo: "1–2" },
  { ate: 5, rotulo: "3–5" },
  { ate: 10, rotulo: "6–10" },
  { ate: 20, rotulo: "11–20" },
  { ate: Infinity, rotulo: "21 ou mais" },
];
function faixa<T extends { ate: number }>(faixas: T[], valor: number): number {
  return faixas.findIndex((f) => valor <= f.ate);
}

interface Classificacao {
  classe: string;
  legenda: string; // rótulo da faixa, pra contagem
  texto: string; // o que a dica mostra
}

function classificar(valor: number | null, ano: number, anoAtual: number, daPesquisa: boolean): Classificacao {
  if (valor === null) return { classe: SEM_DADO, legenda: "sem-dado", texto: `sem dado de ${ano}` };
  const i = faixa(FAIXAS_FOCOS, valor);
  const periodo = daPesquisa ? `agosto de ${ano} (pesquisa)` : ano === anoAtual ? `${ano} (até agora)` : String(ano);
  return {
    classe: PREENCHIMENTO_ESCALA[i],
    legenda: FAIXAS_FOCOS[i].rotulo,
    texto: `${valor} foco${valor === 1 ? "" : "s"} de calor em ${periodo}`,
  };
}

interface PropsMapa {
  arquivo: "/mapa/sp.json" | "/mapa/sp-leve.json";
  focos: FocosPorAno;
  nomes: Record<string, string>;
  anoAtual: number;
}

// Página /mapa: o ano vem da URL (?focos=AAAA — o ?ano= é o da
// confiabilidade), pra um link reproduzir a mesma visão, e trocar de ano
// reescreve a URL sem recarregar. Precisa de <Suspense> em volta
// (useSearchParams numa página pré-renderizada). Padrão: o último ano
// completo.
export function MapaFocosComAnoNaUrl(props: PropsMapa) {
  const params = useSearchParams();
  const pedido = Number(params.get("focos"));
  const padrao = props.focos.anos.includes(props.anoAtual - 1) ? props.anoAtual - 1 : props.focos.anos.at(-1);
  const ano = props.focos.anos.includes(pedido) ? pedido : (padrao ?? props.anoAtual);

  function escolher(novo: number) {
    const busca = new URLSearchParams(params.toString());
    busca.set("focos", String(novo));
    window.history.replaceState(null, "", `?${busca.toString()}`);
  }

  return <MapaSP {...props} ano={ano} aoEscolherAno={escolher} />;
}

export function MapaSP({
  arquivo,
  focos,
  nomes,
  anoAtual,
  ano,
  aoEscolherAno,
}: PropsMapa & {
  ano: number;
  aoEscolherAno: (ano: number) => void;
}) {
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

  const amostra = useMemo(() => new Set(focos.amostra), [focos.amostra]);
  const classificados = useMemo(() => {
    const valores = focos.valores[ano] ?? [];
    const porCodigo = new Map<string, Classificacao>();
    focos.codigos.forEach((codigo, i) => {
      const daPesquisa = ano === ANO_DA_PESQUISA && amostra.has(codigo);
      porCodigo.set(codigo, classificar(valores[i] ?? null, ano, anoAtual, daPesquisa));
    });
    return porCodigo;
  }, [focos, ano, anoAtual, amostra]);

  const contagem = useMemo(() => {
    const c = new Map<string, number>();
    for (const v of classificados.values()) c.set(v.legenda, (c.get(v.legenda) ?? 0) + 1);
    return c;
  }, [classificados]);

  const legenda = FAIXAS_FOCOS.map((f, i) => ({ rotulo: f.rotulo, amostra: AMOSTRA_ESCALA[i], n: contagem.get(f.rotulo) ?? 0 }));
  const semDado = contagem.get("sem-dado") ?? 0;

  const titulo = `Focos de calor em ${ano}${ano === anoAtual ? ", até agora" : ""}`;
  const descricaoAcessivel = `${titulo}, nos 645 municípios de São Paulo: ${legenda
    .map((l) => `${l.rotulo}: ${l.n}`)
    .join("; ")}${semDado ? `; sem dado: ${semDado}` : ""}.`;

  function aoMoverPonteiro(e: React.PointerEvent<SVGSVGElement>) {
    const alvo = (e.target as Element).closest("[data-codigo]");
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!alvo || !caixa) return setDica(null);
    const codigo = alvo.getAttribute("data-codigo") ?? "";
    const item = classificados.get(codigo);
    if (!item) return setDica(null);
    setDica({ x: e.clientX - caixa.left, y: e.clientY - caixa.top, texto: `${nomes[codigo] ?? codigo}: ${item.texto}` });
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Ano dos focos de calor" className="flex flex-wrap gap-1.5">
        {focos.anos.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={ano === a}
            onClick={() => aoEscolherAno(a)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${ano === a ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted hover:text-foreground"}`}
          >
            {a}
          </button>
        ))}
      </div>

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
            // "group", porque "img" torna os filhos apresentacionais e não pode
            // conter elementos interativos.
            role="group"
            aria-label={descricaoAcessivel}
            className="h-auto w-full"
            onPointerMove={aoMoverPonteiro}
            onPointerLeave={() => setDica(null)}
          >
            {Object.entries(dados.municipios).map(([codigo, d]) => (
              // tabIndex -1 e aria-hidden: 645 paradas de Tab seriam inúteis
              // pra quem navega por teclado — a busca e a lista da página
              // inicial são o caminho acessível pros mesmos municípios.
              <a key={codigo} href={`/municipio/${codigo}?periodo=${ano}#ano`} tabIndex={-1} aria-hidden="true">
                <path
                  d={d}
                  data-codigo={codigo}
                  className={`${classificados.get(codigo)?.classe ?? SEM_DADO} stroke-[var(--mapa-contorno)] transition-opacity [stroke-width:0.6] hover:opacity-75`}
                />
              </a>
            ))}
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
      {ano === ANO_DA_PESQUISA && focos.amostra.length > 0 && (
        <p className="text-[11px] text-faint">
          Em {ANO_DA_PESQUISA}, os {focos.amostra.length} municípios estudados na pesquisa mostram os focos de agosto
          (o período da pesquisa); os demais, o ano inteiro.
        </p>
      )}
    </div>
  );
}
