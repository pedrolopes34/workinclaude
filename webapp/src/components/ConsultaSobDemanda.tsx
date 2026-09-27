"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InfoTile } from "./InfoTile";
import { ImagemComFallback } from "./ImagemComFallback";
import { formatKm2 } from "@/lib/format";
import type { ConsultaSobDemanda as ConsultaSobDemandaResultado } from "@/lib/types";

const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Mantido em sincronia manual com PRIMEIRO_ANO_CONSULTA
// (webapp/src/lib/consultaSobDemanda.ts) — 2018-2023 ainda não têm o
// histórico do INPE integrado (docs/DECISIONS.md seção 7).
const PRIMEIRO_ANO = 2024;
const INTERVALO_POLLING_MS = 6000;
const LIMITE_TENTATIVAS_POLLING = 60; // ~6min — GitHub Actions costuma levar 1-4min

function mesEstaDisponivel(ano: number, mes: number, hoje: Date): boolean {
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1; // Date usa 0-indexado; aqui é 1-12
  if (ano < anoAtual) return true;
  if (ano > anoAtual) return false;
  return mes < mesAtual;
}

function primeiroMesDisponivel(ano: number, hoje: Date): number {
  for (let m = 12; m >= 1; m--) {
    if (mesEstaDisponivel(ano, m, hoje)) return m;
  }
  return 1;
}

export function ConsultaSobDemanda({ codigoIbge }: { codigoIbge: string }) {
  const hoje = useMemo(() => new Date(), []);
  const anoAtual = hoje.getFullYear();
  const anosDisponiveis = useMemo(
    () => Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, i) => PRIMEIRO_ANO + i),
    [anoAtual]
  );

  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(() => primeiroMesDisponivel(anoAtual, hoje));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [consultaId, setConsultaId] = useState<number | null>(null);
  const [consulta, setConsulta] = useState<ConsultaSobDemandaResultado | null>(null);
  const tentativasRef = useRef(0);

  useEffect(() => {
    if (!consultaId || !consulta) return;
    if (consulta.status !== "pendente" && consulta.status !== "processando") return;

    const intervalo = setInterval(async () => {
      tentativasRef.current += 1;
      if (tentativasRef.current > LIMITE_TENTATIVAS_POLLING) {
        clearInterval(intervalo);
        setErro("Isso está demorando mais do que o esperado — volte a esta página em alguns minutos.");
        return;
      }
      try {
        const resposta = await fetch(`/api/consultas/${consultaId}`);
        if (!resposta.ok) return;
        setConsulta(await resposta.json());
      } catch {
        // falha pontual de rede — tenta de novo no próximo intervalo
      }
    }, INTERVALO_POLLING_MS);

    return () => clearInterval(intervalo);
  }, [consultaId, consulta]);

  function selecionarAno(novoAno: number) {
    setAno(novoAno);
    if (!mesEstaDisponivel(novoAno, mes, hoje)) {
      setMes(primeiroMesDisponivel(novoAno, hoje));
    }
  }

  async function calcular() {
    setEnviando(true);
    setErro(null);
    setConsulta(null);
    setConsultaId(null);
    tentativasRef.current = 0;

    try {
      const resposta = await fetch("/api/consultas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoIbge, ano, mes }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível iniciar o cálculo.");
        return;
      }
      setConsultaId(dados.id);
      setConsulta(dados);
    } catch {
      setErro("Não foi possível conectar ao servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const emAndamento = consulta?.status === "pendente" || consulta?.status === "processando";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-medium text-foreground">Consultar outro período</h2>
        <p className="mt-1 text-xs text-muted">
          Escolha um mês já encerrado e o sistema roda o agrupamento de focos de calor e a
          leitura de satélite ao vivo, só para esse recorte — sem confiabilidade nem comparação
          com o MapBiomas. Leva de 1 a 4 minutos.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Ano
          <select
            value={ano}
            onChange={(e) => selecionarAno(Number(e.target.value))}
            disabled={enviando || emAndamento}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {anosDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Mês
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            disabled={enviando || emAndamento}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {NOMES_MESES.map((nome, i) => {
              const numero = i + 1;
              const disponivel = mesEstaDisponivel(ano, numero, hoje);
              return (
                <option key={numero} value={numero} disabled={!disponivel}>
                  {nome}
                  {!disponivel ? " (ainda não encerrado)" : ""}
                </option>
              );
            })}
          </select>
        </label>
        <button
          type="button"
          onClick={calcular}
          disabled={enviando || emAndamento}
          className="rounded-full bg-acento-botao px-4 py-2 text-[19px] font-bold text-white transition-colors hover:bg-acento-botao-hover disabled:opacity-50"
        >
          {emAndamento ? "Calculando…" : "Calcular"}
        </button>
      </div>

      <p className="text-[11px] text-faint">2018–2023: histórico do INPE ainda não integrado.</p>

      {erro && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
          {erro}
        </p>
      )}

      {emAndamento && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-acento border-t-transparent"
            aria-hidden="true"
          />
          Calculando {NOMES_MESES[mes - 1]}/{ano}…
        </p>
      )}

      {consulta?.status === "erro" && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
          {consulta.mensagemErro ?? "Não foi possível concluir o cálculo."}
        </p>
      )}

      {consulta?.status === "concluido" && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoTile
              rotulo="Focos de calor"
              valor={consulta.numFocosCalor ?? "—"}
              explicacao="Total de focos de calor do INPE detectados nesse município, nesse mês."
            />
            <InfoTile
              rotulo="Agrupamentos"
              valor={consulta.numAgrupamentos ?? "—"}
              explicacao="Quantos agrupamentos espaço-temporais (focos próximos no tempo e no espaço) o método formou nesse mês."
            />
            <InfoTile
              rotulo="Área (agrupamento)"
              valor={formatKm2(consulta.areaStDbscanKm2)}
              explicacao="Área de influência dos agrupamentos de focos de calor formados nesse mês."
            />
            <InfoTile
              rotulo="Área (satélite)"
              valor={formatKm2(consulta.areaDnbrKm2)}
              explicacao="Área com evidência espectral de queima (dNBR) na leitura de satélite desse mês. Fica sem valor quando a imagem disponível tinha nuvem demais sobre o município."
            />
          </div>
          {consulta.dnbrImagemUrl && (
            <ImagemComFallback
              src={consulta.dnbrImagemUrl}
              alt={`Mapa de severidade de queimada (dNBR) deste município em ${NOMES_MESES[mes - 1]}/${ano}`}
              className="h-auto w-full rounded-xl border border-border"
              mensagemFallback="Não foi possível carregar o mapa desta consulta agora."
            />
          )}
        </div>
      )}
    </section>
  );
}
