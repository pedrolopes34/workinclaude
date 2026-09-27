import type { ConfiabilidadePorAno } from "@/components/mapas/MapaConfiabilidade";
import type { ConfiabilidadeNoAno, MosaicoDnbr } from "./types";

// Monta ano -> código -> classificação pro mapa de confiabilidade
// (docs/DECISIONS.md seção 6.55). `soAno` corta o resto (prévia da home).
export function agruparConfiabilidade(linhas: ConfiabilidadeNoAno[], soAno?: number): ConfiabilidadePorAno {
  const porAno: ConfiabilidadePorAno = {};
  for (const l of linhas) {
    if (soAno !== undefined && l.ano !== soAno) continue;
    (porAno[l.ano] ??= {})[l.codigoIbge] = {
      nivel: l.confiabilidade,
      interseccao: l.interseccaoPct === null ? null : Number(l.interseccaoPct),
      pesquisa: l.fonte === "manual",
    };
  }
  return porAno;
}

export function anoMaisRecente(linhas: ConfiabilidadeNoAno[]): number | null {
  return linhas.reduce<number | null>((max, l) => (max === null || l.ano > max ? l.ano : max), null);
}

// Mês de vitrine do mapa de leitura de satélite: agosto de 2024 (período da
// pesquisa, o grande episódio de queimadas de SP) quando existe; senão o
// mais recente.
export function mesDeVitrine(mosaicos: MosaicoDnbr[]): MosaicoDnbr | null {
  return mosaicos.find((m) => m.ano === 2024 && m.mes === 8) ?? mosaicos[mosaicos.length - 1] ?? null;
}
