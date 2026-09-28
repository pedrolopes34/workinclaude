import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIABILIDADE_STYLE,
  REGRA_CONFIABILIDADE,
  formatData,
  formatKm2,
  formatPValor,
  formatPct,
  origemDasMetricas,
  rotuloJanelaDnbr,
  rotuloOrigemValidacao,
} from "./format";

afterEach(() => {
  vi.useRealTimers();
});

describe("números no formato brasileiro", () => {
  it("Interseção como percentual com vírgula, nunca decimal (CLAUDE.md)", () => {
    expect(formatPct("6.1")).toBe("6,1%");
    expect(formatPct(62.5, 0)).toBe("63%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct("não é número")).toBe("—");
  });

  it("área em km² com até duas casas", () => {
    expect(formatKm2("1435.52")).toBe("1.435,52 km²");
    expect(formatKm2(9.7)).toBe("9,7 km²");
    expect(formatKm2(null)).toBe("—");
  });

  it("valor-p sempre com três casas", () => {
    expect(formatPValor("0.04")).toBe("0,040");
    expect(formatPValor(null)).toBe("—");
  });

  it("data no fuso de São Paulo, não no do servidor", () => {
    // 02:00 UTC do dia 28 ainda é dia 27 em SP
    expect(formatData("2026-09-28T02:00:00Z")).toBe("27/09/2026");
    expect(formatData(null)).toBe("—");
  });
});

describe("selos de confiabilidade", () => {
  it("os quatro níveis têm selo e regra em linguagem simples", () => {
    for (const nivel of ["Alta", "Média", "Baixa", "Insuficiente"] as const) {
      expect(CONFIABILIDADE_STYLE[nivel].label).toBe(nivel);
      expect(REGRA_CONFIABILIDADE[nivel].length).toBeGreaterThan(20);
    }
  });

  it("sem vermelho em nenhum selo (pedido do Pedro, seção 6.55)", () => {
    for (const { classe } of Object.values(CONFIABILIDADE_STYLE)) {
      expect(classe).not.toMatch(/red|rose|terracota|mostarda/);
    }
    expect(CONFIABILIDADE_STYLE.Insuficiente.classe).toContain("border-dashed");
  });

  it("a regra da Alta exige os dois critérios, não um ou outro", () => {
    expect(REGRA_CONFIABILIDADE.Alta).toMatch(/dois critérios passaram/);
  });
});

describe("origem de cada número", () => {
  it("2024 dos 63 da amostra é o dado da pesquisa (agosto)", () => {
    expect(origemDasMetricas(2024, true)).toEqual({ periodo: "agosto de 2024, pesquisa", origem: "pesquisa" });
  });

  it("fora da amostra é cálculo automático, do ano inteiro ou parcial", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    expect(origemDasMetricas(2024, false)).toEqual({ periodo: "2024 inteiro", origem: "cálculo automático" });
    expect(origemDasMetricas(2026, true)).toEqual({ periodo: "2026 até agora", origem: "cálculo automático" });
  });

  it("rótulo da comparação com o MapBiomas", () => {
    expect(rotuloOrigemValidacao("manual", 2024)).toBe("agosto de 2024, conferido na pesquisa");
    expect(rotuloOrigemValidacao("automatico", 2021)).toBe("2021 inteiro, cálculo automático");
  });
});

describe("janela da leitura de satélite pela chave da miniatura", () => {
  it("usa a miniatura mais recente e o mês anterior a ela", () => {
    const urls = [
      "https://pub-x.r2.dev/dnbr/3500105-2026-08.png",
      null,
      "https://pub-x.r2.dev/dnbr/3500204-2026-09.png",
    ];
    expect(rotuloJanelaDnbr(urls)).toBe("ago → set/2026");
  });

  it("em janeiro, o mês anterior é dezembro do ano passado", () => {
    expect(rotuloJanelaDnbr(["https://x/dnbr/3500105-2027-01.png"])).toBe("dez/2026 → jan/2027");
  });

  it("sem chave reconhecível", () => {
    expect(rotuloJanelaDnbr([null, "https://x/outra-coisa.png"])).toBe("mais recente");
  });
});
