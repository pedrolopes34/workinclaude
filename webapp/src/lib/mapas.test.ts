import { describe, expect, it } from "vitest";
import {
  agruparConfiabilidade,
  anoMaisRecente,
  anosComConfiabilidade,
  avisoSemLeitura,
  confiabilidadeDoAno,
  contarNiveis,
  mesDeVitrine,
  montarFocosPorAno,
} from "./mapas";
import { chaveMes, rotuloMes } from "./meses";
import { urlPublicaDnbr, urlPublicaR2, R2_BASE_PUBLICA } from "./imagensR2";
import type { ConfiabilidadeNoAno, MosaicoDnbr } from "./types";

const linhas: ConfiabilidadeNoAno[] = [
  { codigoIbge: "3539509", ano: 2024, confiabilidade: "Alta", interseccaoPct: "12.5", fonte: "manual" },
  { codigoIbge: "3500105", ano: 2024, confiabilidade: "Insuficiente", interseccaoPct: null, fonte: "automatico" },
  { codigoIbge: "3500105", ano: 2021, confiabilidade: "Baixa", interseccaoPct: "0.8", fonte: "automatico" },
];

describe("mapa de confiabilidade", () => {
  it("agrupa por ano e código, com a Interseção como número", () => {
    const porAno = agruparConfiabilidade(linhas);
    expect(Object.keys(porAno).sort()).toEqual(["2021", "2024"]);
    expect(porAno[2024]["3539509"]).toEqual({ nivel: "Alta", interseccao: 12.5, pesquisa: true });
    expect(porAno[2024]["3500105"]).toEqual({ nivel: "Insuficiente", interseccao: null, pesquisa: false });
  });

  it("soAno corta os outros anos (prévia da página inicial)", () => {
    expect(Object.keys(agruparConfiabilidade(linhas, 2021))).toEqual(["2021"]);
  });

  it("ano mais recente, ou nada sem linhas", () => {
    expect(anoMaisRecente(linhas)).toBe(2024);
    expect(anoMaisRecente([])).toBeNull();
  });
});

function mosaico(ano: number, mes: number): MosaicoDnbr {
  return {
    ano,
    mes,
    imagemUrl: `${R2_BASE_PUBLICA}/dnbr-estado/${chaveMes({ ano, mes })}.webp`,
    oeste: -53.1,
    sul: -25.3,
    leste: -44.2,
    norte: -19.8,
    colecao: "COPERNICUS/S2_SR_HARMONIZED",
  } as MosaicoDnbr;
}

describe("mapa da leitura de satélite", () => {
  it("vitrine é agosto de 2024 (período da pesquisa) quando existe", () => {
    const lista = [mosaico(2024, 7), mosaico(2024, 8), mosaico(2026, 8)];
    expect(mesDeVitrine(lista)).toMatchObject({ ano: 2024, mes: 8 });
  });

  it("sem agosto de 2024, o mês mais recente; sem mosaico, nada", () => {
    expect(mesDeVitrine([mosaico(2025, 1), mosaico(2026, 8)])).toMatchObject({ ano: 2026, mes: 8 });
    expect(mesDeVitrine([])).toBeNull();
  });

  it("chave e rótulo do mês", () => {
    expect(chaveMes({ ano: 2018, mes: 1 })).toBe("2018-01");
    expect(rotuloMes({ ano: 2026, mes: 3 })).toBe("março de 2026");
  });
});

describe("endereço público das imagens no R2", () => {
  it("remonta a URL gravada com o endpoint privado (seção 6.49)", () => {
    const gravada = "https://abc.r2.cloudflarestorage.com/bucket/dnbr/3500105-2026-09.png";
    expect(urlPublicaDnbr(gravada)).toBe(`${R2_BASE_PUBLICA}/dnbr/3500105-2026-09.png`);
    expect(urlPublicaR2(gravada)).toBe(`${R2_BASE_PUBLICA}/dnbr/3500105-2026-09.png`);
  });

  it("vale pros mosaicos do estado também", () => {
    expect(urlPublicaR2("https://qualquer/dnbr-estado/2018-01.webp")).toBe(`${R2_BASE_PUBLICA}/dnbr-estado/2018-01.webp`);
  });

  it("deixa como está o que não é do bucket, e nada continua nada", () => {
    expect(urlPublicaR2("/dnbr-pitangueiras.png")).toBe("/dnbr-pitangueiras.png");
    expect(urlPublicaR2(null)).toBeNull();
    expect(urlPublicaDnbr(null)).toBeNull();
  });
});

describe("mapa de focos por ano", () => {
  it("códigos uma vez, um vetor por ano na mesma ordem, lacunas como nulo", () => {
    const focos = montarFocosPorAno([
      { codigoIbge: "3539509", naAmostra: true, ano: 2024, numFocosCalor: 12 },
      { codigoIbge: "3500105", naAmostra: false, ano: 2024, numFocosCalor: 40 },
      { codigoIbge: "3500105", naAmostra: false, ano: 2018, numFocosCalor: 3 },
    ]);
    expect(focos.codigos).toEqual(["3500105", "3539509"]);
    expect(focos.anos).toEqual([2018, 2024]);
    expect(focos.valores[2024]).toEqual([40, 12]);
    expect(focos.valores[2018]).toEqual([3, null]); // Pitangueiras sem linha em 2018
    expect(focos.amostra).toEqual(["3539509"]);
  });
});

describe("confiabilidade por ano (página inicial)", () => {
  it("anos em ordem, classificação e contagem só do ano escolhido", () => {
    expect(anosComConfiabilidade(linhas)).toEqual([2021, 2024]);
    const de2024 = confiabilidadeDoAno(linhas, 2024);
    expect([...de2024.keys()].sort()).toEqual(["3500105", "3539509"]);
    expect(contarNiveis(de2024)).toEqual({ Alta: 1, Média: 0, Baixa: 0, Insuficiente: 1 });
    expect(contarNiveis(confiabilidadeDoAno(linhas, 2021))).toEqual({ Alta: 0, Média: 0, Baixa: 1, Insuficiente: 0 });
    expect(confiabilidadeDoAno(linhas, 2019).size).toBe(0);
  });
});

describe("aviso de falta de leitura no mapa do estado", () => {
  it("diz quanto do estado ficou sem leitura por causa das nuvens", () => {
    expect(avisoSemLeitura(53)).toBe(
      "Nas áreas hachuradas (47% do estado), as nuvens impediram o satélite de enxergar o solo neste mês: não há leitura."
    );
    expect(avisoSemLeitura(99.2)).toMatch(/\(1% do estado\)/);
  });

  it("sem aviso quando o estado está coberto ou a cobertura é desconhecida", () => {
    expect(avisoSemLeitura(99.6)).toBeNull();
    expect(avisoSemLeitura(100)).toBeNull();
    expect(avisoSemLeitura(null)).toBeNull();
  });
});
