import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinhaExportacao } from "@/lib/queries";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/queries", () => ({ listarParaExportacao: vi.fn() }));

const { GET } = await import("./route");
const { listarParaExportacao } = await import("@/lib/queries");

const BASE: LinhaExportacao = {
  codigoIbge: "3539509",
  nome: "Pitangueiras",
  mesorregiao: "Ribeirão Preto",
  naAmostra: true,
  ano: 2024,
  numFocosCalor: 12,
  numAgrupamentos: 2,
  areaStDbscanKm2: "3.50",
  areaDnbrKm2: null,
  epsSpaceKm: "1.5",
  epsTimeDays: "5",
  minSamples: 4,
  confiabilidade: "Alta",
  fonte: "manual",
  recallPct: "61.20",
  interseccaoPct: "6.10",
  pValor: "0.010",
  areaMapbiomasKm2: "20.00",
  mapbiomasColecao: "Coleção 4",
  nPermutacoes: 999,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function baixar(linhas: LinhaExportacao[]) {
  vi.mocked(listarParaExportacao).mockResolvedValue(linhas);
  const resposta = await GET();
  // Bytes, não .text(): a decodificação UTF-8 padrão engole o BOM.
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  return { resposta, bytes, linhas: texto.replace(/^\uFEFF/, "").split("\r\n") };
}

describe("GET /dados/municipios.csv", () => {
  it("CSV com BOM (pro Excel abrir os acentos), CRLF e o cabeçalho completo", async () => {
    const { resposta, bytes, linhas } = await baixar([BASE]);
    expect(resposta.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(linhas[0].split(",")).toHaveLength(22);
    expect(linhas[0]).toMatch(/^codigo_ibge,municipio,mesorregiao,na_amostra_da_pesquisa,ano,/);
    expect(linhas.at(-1)).toBe(""); // termina com quebra de linha
  });

  it("dado da pesquisa sai como agosto de 2024, origem pesquisa", async () => {
    const { linhas } = await baixar([BASE]);
    const celulas = linhas[1].split(",");
    expect(celulas.slice(0, 7)).toEqual(["3539509", "Pitangueiras", "Ribeirão Preto", "true", "2024", "2024-08", "pesquisa"]);
    expect(celulas[15]).toBe("pesquisa"); // origem_confiabilidade
    expect(celulas[10]).toBe(""); // sem leitura de satélite: vazio, não zero
  });

  it("cálculo automático: ano inteiro, ou parcial no ano corrente", async () => {
    const { linhas } = await baixar([
      { ...BASE, naAmostra: false, ano: 2021, fonte: "automatico" },
      { ...BASE, naAmostra: false, ano: 2026, fonte: null, confiabilidade: null },
    ]);
    expect(linhas[1].split(",").slice(5, 7)).toEqual(["2021", "automatico"]);
    expect(linhas[2].split(",").slice(5, 7)).toEqual(["2026 (parcial)", "automatico"]);
    expect(linhas[2].split(",")[15]).toBe(""); // sem comparação com o MapBiomas
  });

  it("ano só com comparação, sem métricas, não inventa período", async () => {
    const { linhas } = await baixar([{ ...BASE, numFocosCalor: null, areaDnbrKm2: null, naAmostra: false }]);
    expect(linhas[1].split(",").slice(5, 7)).toEqual(["", ""]);
  });

  it("escapa vírgula e aspas (RFC 4180)", async () => {
    const { linhas } = await baixar([{ ...BASE, nome: 'Santa Rita, "do Passa Quatro"' }]);
    expect(linhas[1]).toContain('"Santa Rita, ""do Passa Quatro"""');
  });
});
