import type { ConfiabilidadePorAno } from "@/components/mapas/MapaConfiabilidade";
import type { ConfiabilidadeNoAno, ContagemConfiabilidade, LinhaFocosAno, MosaicoDnbr } from "./types";

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

// Focos por ano no formato do mapa (seção 6.57): os códigos uma vez só e um
// vetor por ano na mesma ordem — 645 × 9 números em vez de 5.805 objetos no
// HTML da página.
export interface FocosPorAno {
  codigos: string[];
  anos: number[];
  valores: Record<number, (number | null)[]>;
  // Em 2024, a linha destes é a da pesquisa: só agosto.
  amostra: string[];
}

export function montarFocosPorAno(linhas: LinhaFocosAno[]): FocosPorAno {
  const codigos = [...new Set(linhas.map((l) => l.codigoIbge))].sort();
  const anos = [...new Set(linhas.map((l) => l.ano))].sort((a, b) => a - b);
  const posicao = new Map(codigos.map((c, i) => [c, i]));
  const valores: Record<number, (number | null)[]> = {};
  for (const ano of anos) valores[ano] = codigos.map(() => null);
  for (const l of linhas) valores[l.ano][posicao.get(l.codigoIbge)!] = l.numFocosCalor;
  const amostra = [...new Set(linhas.filter((l) => l.naAmostra).map((l) => l.codigoIbge))].sort();
  return { codigos, anos, valores, amostra };
}

// Seletor de ano da confiabilidade na página inicial (seção 6.57, pedido do
// Pedro: "selecionar o ano, e ter a confiabilidade"): os anos que existem, do
// mais antigo ao mais recente, e a classificação de cada município no ano.
export function anosComConfiabilidade(linhas: ConfiabilidadeNoAno[]): number[] {
  return [...new Set(linhas.map((l) => l.ano))].sort((a, b) => a - b);
}

export function confiabilidadeDoAno(linhas: ConfiabilidadeNoAno[], ano: number): Map<string, ConfiabilidadeNoAno> {
  return new Map(linhas.filter((l) => l.ano === ano).map((l) => [l.codigoIbge, l]));
}

export function contarNiveis(doAno: Map<string, ConfiabilidadeNoAno>): ContagemConfiabilidade {
  const contagem: ContagemConfiabilidade = { Alta: 0, Média: 0, Baixa: 0, Insuficiente: 0 };
  for (const l of doAno.values()) contagem[l.confiabilidade] += 1;
  return contagem;
}

// Aviso do mapa do estado quando parte dele ficou sem leitura no mês (seção
// 6.57, pedido do Pedro: "se impossível, informe que as nuvens impediram"):
// só quando falta um pedaço que se vê no mapa.
export function avisoSemLeitura(coberturaPct: number | null): string | null {
  if (coberturaPct === null || coberturaPct >= 99.5) return null;
  const falta = Math.max(1, Math.round(100 - coberturaPct));
  return `Nas áreas hachuradas (${falta}% do estado), as nuvens impediram o satélite de enxergar o solo neste mês: não há leitura.`;
}
