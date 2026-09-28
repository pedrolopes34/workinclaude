import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Rotas de /api/consultas (docs/DECISIONS.md seção 6.43) com o banco e o
// disparo do GitHub Actions simulados: aqui se testa só a orquestração —
// validação, reaproveitamento, limite de 5 por hora e o que acontece quando
// o disparo falha. validarPeriodo é o de verdade.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/queries", () => ({ municipioExiste: vi.fn() }));
vi.mock("@/lib/consultaSobDemanda", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/consultaSobDemanda")>();
  return {
    ...real,
    garantirTabelaConsultas: vi.fn(),
    buscarConsultaConcluida: vi.fn(),
    contarConsultasRecentes: vi.fn(),
    criarConsultaPendente: vi.fn(),
    dispararConsultaWorkflow: vi.fn(),
    marcarConsultaComoErro: vi.fn(),
  };
});

const { GET, POST } = await import("./route");
const { municipioExiste } = await import("@/lib/queries");
const consultas = await import("@/lib/consultaSobDemanda");

const CONCLUIDA = {
  id: 15,
  status: "concluido" as const,
  numFocosCalor: 0,
  numAgrupamentos: 0,
  areaStDbscanKm2: "0.00",
  areaDnbrKm2: "9.70",
  dnbrImagemUrl: "https://pub-x.r2.dev/dnbr/3501608-2026-08.png",
  mensagemErro: null,
};

function pedir(corpo: unknown, ip = "200.1.2.3") {
  return new NextRequest("http://localhost/api/consultas", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  vi.mocked(municipioExiste).mockResolvedValue(true);
  vi.mocked(consultas.buscarConsultaConcluida).mockResolvedValue(null);
  vi.mocked(consultas.contarConsultasRecentes).mockResolvedValue(0);
  vi.mocked(consultas.criarConsultaPendente).mockResolvedValue(42);
  vi.mocked(consultas.dispararConsultaWorkflow).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST /api/consultas", () => {
  it("cria a consulta pendente e dispara o cálculo", async () => {
    const resposta = await POST(pedir({ codigoIbge: "3501608", ano: 2026, mes: 8 }));

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toMatchObject({ id: 42, status: "pendente", reaproveitado: false });
    expect(consultas.criarConsultaPendente).toHaveBeenCalledWith("3501608", 2026, 8, "200.1.2.3");
    expect(consultas.dispararConsultaWorkflow).toHaveBeenCalledWith({
      consultaId: 42,
      codigoIbge: "3501608",
      ano: 2026,
      mes: 8,
    });
  });

  it("reaproveita um cálculo já concluído sem gastar outro", async () => {
    vi.mocked(consultas.buscarConsultaConcluida).mockResolvedValue(CONCLUIDA);

    const resposta = await POST(pedir({ codigoIbge: "3501608", ano: 2026, mes: 8 }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ id: 15, reaproveitado: true });
    expect(consultas.criarConsultaPendente).not.toHaveBeenCalled();
    expect(consultas.dispararConsultaWorkflow).not.toHaveBeenCalled();
  });

  it("limita a 5 por hora por IP", async () => {
    vi.mocked(consultas.contarConsultasRecentes).mockResolvedValue(5);

    const resposta = await POST(pedir({ codigoIbge: "3501608", ano: 2026, mes: 8 }));

    expect(resposta.status).toBe(429);
    expect(consultas.contarConsultasRecentes).toHaveBeenCalledWith("200.1.2.3");
    expect(consultas.criarConsultaPendente).not.toHaveBeenCalled();
  });

  it("disparo que falha vira erro legível e marca a consulta", async () => {
    vi.mocked(consultas.dispararConsultaWorkflow).mockRejectedValue(new Error("401 do GitHub"));
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});

    const resposta = await POST(pedir({ codigoIbge: "3501608", ano: 2026, mes: 8 }));

    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toEqual({ erro: "Não foi possível iniciar o cálculo." });
    expect(consultas.marcarConsultaComoErro).toHaveBeenCalledWith(42, expect.stringMatching(/Tente de novo/));
    silencio.mockRestore();
  });

  it("recusa pedido sem município, com mês em aberto ou município inexistente", async () => {
    expect((await POST(pedir({ ano: 2026, mes: 8 }))).status).toBe(400);

    const mesAberto = await POST(pedir({ codigoIbge: "3501608", ano: 2026, mes: 9 }));
    expect(mesAberto.status).toBe(400);
    expect((await mesAberto.json()).erro).toMatch(/ainda não terminou/);

    vi.mocked(municipioExiste).mockResolvedValue(false);
    expect((await POST(pedir({ codigoIbge: "9999999", ano: 2026, mes: 8 }))).status).toBe(404);

    expect(consultas.dispararConsultaWorkflow).not.toHaveBeenCalled();
  });

  it("corpo que não é JSON é tratado como pedido sem município", async () => {
    const pedido = new NextRequest("http://localhost/api/consultas", { method: "POST", body: "{quebrado" });
    expect((await POST(pedido)).status).toBe(400);
  });
});

describe("GET /api/consultas (link reproduzível)", () => {
  function abrir(busca: string) {
    return GET(new NextRequest(`http://localhost/api/consultas?${busca}`));
  }

  it("devolve o resultado já calculado sem disparar nada", async () => {
    vi.mocked(consultas.buscarConsultaConcluida).mockResolvedValue(CONCLUIDA);

    const resposta = await abrir("codigoIbge=3501608&ano=2026&mes=8");

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ id: 15, areaDnbrKm2: "9.70", reaproveitado: true });
    expect(consultas.dispararConsultaWorkflow).not.toHaveBeenCalled();
  });

  it("ainda não calculado é 404, e código IBGE malformado é 400", async () => {
    expect((await abrir("codigoIbge=3501608&ano=2026&mes=8")).status).toBe(404);
    expect((await abrir("codigoIbge=350&ano=2026&mes=8")).status).toBe(400);
    expect((await abrir("codigoIbge=3501608&ano=2017&mes=8")).status).toBe(400);
  });
});
