import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O módulo importa a conexão; aqui nada toca o banco.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

const { validarPeriodo, PRIMEIRO_ANO_CONSULTA } = await import("./consultaSobDemanda");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("período da consulta por mês", () => {
  it("aceita de 2018 em diante (seção 6.55)", () => {
    expect(PRIMEIRO_ANO_CONSULTA).toBe(2018);
    expect(validarPeriodo(2018, 1)).toEqual({ ok: true });
    expect(validarPeriodo(2017, 12)).toEqual({ ok: false, motivo: "Ano precisa estar entre 2018 e 2026." });
  });

  it("só mês já encerrado", () => {
    expect(validarPeriodo(2026, 8)).toEqual({ ok: true });
    expect(validarPeriodo(2026, 9)).toMatchObject({ ok: false, motivo: expect.stringMatching(/ainda não terminou/) });
    expect(validarPeriodo(2027, 1)).toMatchObject({ ok: false });
  });

  it("dezembro termina no dia 1º de janeiro", () => {
    vi.setSystemTime(new Date("2027-01-01T00:00:01Z"));
    expect(validarPeriodo(2026, 12)).toEqual({ ok: true });
  });

  it("mês fora de 1–12 ou não inteiro", () => {
    expect(validarPeriodo(2025, 0)).toEqual({ ok: false, motivo: "Mês inválido." });
    expect(validarPeriodo(2025, 13)).toEqual({ ok: false, motivo: "Mês inválido." });
    expect(validarPeriodo(2025, 6.5)).toEqual({ ok: false, motivo: "Mês inválido." });
    expect(validarPeriodo(Number.NaN, 6)).toMatchObject({ ok: false });
  });
});
