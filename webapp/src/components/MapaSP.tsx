"use client";

import { useEffect, useState } from "react";
import type { Confiabilidade } from "@/lib/types";

// Mapa dos 645 municípios (docs/DECISIONS.md seção 6.52). A geometria é um
// arquivo estático pré-projetado (geodata/gerar_mapa_sp.py, malha do IBGE)
// em /public/mapa, baixado e desenhado no navegador: fica em cache e não vai
// duplicada no HTML e no payload de hidratação (renderizado no servidor, o
// /mapa passava de 740 KB). Sem biblioteca de mapa.
//
// Cor = confiabilidade validada pela pesquisa, com as cores protegidas dos
// selos (CLAUDE.md); sem validação = neutro. Não é escala contínua, então
// não sugere gradiente de "melhor/pior" entre municípios.
interface DadosMapa {
  largura: number;
  altura: number;
  fonte: string;
  municipios: Record<string, string>;
}

export const FONTE_MALHA = "Malha municipal: IBGE, via geodata-br (CC0)";

const PREENCHIMENTO: Record<Confiabilidade, string> = {
  Alta: "fill-verde",
  Média: "fill-mostarda",
  Baixa: "fill-terracota",
  Insuficiente: "fill-stone-400",
};
const SEM_VALIDACAO = "fill-[var(--border)]";

export function rotuloNoMapa(confiabilidade: Confiabilidade | undefined): string {
  return confiabilidade ? `confiabilidade ${confiabilidade}` : "não validado pela pesquisa";
}

export function MapaSP({
  arquivo,
  categorias,
  nomes,
  descricao,
}: {
  arquivo: "/mapa/sp.json" | "/mapa/sp-leve.json";
  categorias: Record<string, Confiabilidade>;
  // Com nomes, cada município vira link pra própria página, com o nome ao
  // passar o mouse. Sem nomes (prévia da home), é só desenho.
  nomes?: Record<string, string>;
  descricao: string;
}) {
  const [dados, setDados] = useState<DadosMapa | null>(null);
  const [falhou, setFalhou] = useState(false);

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

  if (!dados) {
    return (
      <div
        role="img"
        aria-label={descricao}
        className={`flex w-full items-center justify-center rounded-xl bg-background text-xs text-faint ${falhou ? "" : "animate-pulse"}`}
        style={{ aspectRatio: "1000 / 662" }}
      >
        {falhou ? "Não foi possível carregar o mapa agora." : null}
      </div>
    );
  }

  const comLinks = Boolean(nomes);
  return (
    <svg
      viewBox={`0 0 ${dados.largura} ${dados.altura}`}
      // Versão com links: "group", porque "img" torna os filhos
      // apresentacionais e não pode conter elementos interativos.
      role={comLinks ? "group" : "img"}
      aria-label={descricao}
      className="h-auto w-full"
    >
      {Object.entries(dados.municipios).map(([codigo, d]) => {
        const nivel = categorias[codigo];
        const caminho = (
          <path
            d={d}
            className={`${nivel ? PREENCHIMENTO[nivel] : SEM_VALIDACAO} stroke-[var(--background)] transition-opacity [stroke-width:0.6] ${comLinks ? "hover:opacity-70" : ""}`}
          >
            {nomes && <title>{`${nomes[codigo] ?? codigo}: ${rotuloNoMapa(nivel)}`}</title>}
          </path>
        );
        return comLinks ? (
          // tabIndex -1 e aria-hidden: 645 paradas de Tab seriam inúteis pra
          // quem navega por teclado — a busca e a lista da página inicial são
          // o caminho acessível pros mesmos municípios.
          <a key={codigo} href={`/municipio/${codigo}`} tabIndex={-1} aria-hidden="true">
            {caminho}
          </a>
        ) : (
          <g key={codigo}>{caminho}</g>
        );
      })}
    </svg>
  );
}

export function LegendaMapa({ contagem }: { contagem: Record<Confiabilidade, number> & { semValidacao: number } }) {
  const itens: { rotulo: string; classe: string; n: number }[] = [
    { rotulo: "Alta", classe: "bg-verde", n: contagem.Alta },
    { rotulo: "Média", classe: "bg-mostarda", n: contagem.Média },
    { rotulo: "Baixa", classe: "bg-terracota", n: contagem.Baixa },
    { rotulo: "Insuficiente", classe: "bg-stone-400", n: contagem.Insuficiente },
    { rotulo: "Não validado pela pesquisa", classe: "bg-[var(--border)]", n: contagem.semValidacao },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm border border-border ${i.classe}`} aria-hidden="true" />
          {i.rotulo} <span className="font-mono text-faint">({i.n})</span>
        </li>
      ))}
    </ul>
  );
}
