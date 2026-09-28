import { describe, expect, it } from "vitest";
import { agruparConfiabilidade, anoMaisRecente, mesDeVitrine } from "./mapas";
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
