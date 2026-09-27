"use client";

import { useEffect, useState } from "react";

// Malha dos 645 municípios, pré-projetada (geodata/gerar_mapa_sp.py) e servida
// como arquivo estático em /public/mapa — compartilhada pelos mapas do site
// (docs/DECISIONS.md seções 6.52, 6.54 e 6.55).
export interface MalhaSP {
  largura: number;
  altura: number;
  // [oeste, sul, leste, norte] em graus: o retângulo que o viewBox desenha,
  // com projeção linear em longitude e em latitude.
  limites: [number, number, number, number];
  fonte: string;
  areas_km2?: Record<string, number>;
  municipios: Record<string, string>;
}

export const FONTE_MALHA = "Malha municipal: IBGE, via geodata-br (CC0)";

export function useMalhaSP(arquivo: "/mapa/sp.json" | "/mapa/sp-leve.json") {
  const [malha, setMalha] = useState<MalhaSP | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const controle = new AbortController();
    fetch(arquivo, { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setMalha)
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFalhou(true);
      });
    return () => controle.abort();
  }, [arquivo]);

  return { malha, falhou };
}

// Onde um retângulo em graus cai no viewBox da malha. A projeção do
// gerar_mapa_sp.py é x = (lon − oeste) · escala · cos(lat média) e
// y = (norte − lat) · escala, com a escala que faz a largura dar 1000.
export function retanguloNoMapa(
  malha: MalhaSP,
  [oeste, sul, leste, norte]: [number, number, number, number]
): { x: number; y: number; largura: number; altura: number } {
  const [lon0, lat0, lon1, lat1] = malha.limites;
  const fatorLon = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const escala = malha.largura / ((lon1 - lon0) * fatorLon);
  return {
    x: (oeste - lon0) * fatorLon * escala,
    y: (lat1 - norte) * escala,
    largura: (leste - oeste) * fatorLon * escala,
    altura: (norte - sul) * escala,
  };
}

export function EsqueletoMapa({ falhou, rotulo }: { falhou: boolean; rotulo: string }) {
  return (
    <div
      role="img"
      aria-label={rotulo}
      className={`flex w-full items-center justify-center rounded-xl bg-background text-xs text-faint ${falhou ? "" : "animate-pulse"}`}
      style={{ aspectRatio: "1000 / 669" }}
    >
      {falhou ? "Não foi possível carregar o mapa agora." : null}
    </div>
  );
}

export function Dica({ dica }: { dica: { x: number; y: number; texto: string } | null }) {
  if (!dica) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-lg"
      style={{ left: dica.x, top: dica.y - 10 }}
    >
      {dica.texto}
    </div>
  );
}
