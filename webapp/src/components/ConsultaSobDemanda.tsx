"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { InfoTile } from "./InfoTile";
import { ImagemComFallback } from "./ImagemComFallback";
import { formatKm2 } from "@/lib/format";
import type { ConsultaSobDemanda as ConsultaSobDemandaResultado } from "@/lib/types";

const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Mantido em sincronia manual com PRIMEIRO_ANO_CONSULTA
// (webapp/src/lib/consultaSobDemanda.ts, seção 6.55).
const PRIMEIRO_ANO = 2018;
const INTERVALO_POLLING_MS = 6000;
// ~9min: acima dos 8min em que o servidor marca a consulta travada como erro (expirarSeTravada).
const LIMITE_TENTATIVAS_POLLING = 90;

const ETAPAS = ["Pedido enviado", "Na fila", "Calculando", "Pronto"] as const;

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

// Período vindo da URL (?ano=&mes=) só vale se for um mês já encerrado e
// dentro da janela da consulta — senão cai no padrão (último mês encerrado).
function periodoDaUrl(
  anoTexto: string | undefined,
  mesTexto: string | undefined,
  hoje: Date
): { ano: number; mes: number } | null {
  const ano = Number(anoTexto);
  const mes = Number(mesTexto);
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return null;
  if (ano < PRIMEIRO_ANO || ano > hoje.getFullYear() || mes < 1 || mes > 12) return null;
  return mesEstaDisponivel(ano, mes, hoje) ? { ano, mes } : null;
}

function etapaAtual(consulta: ConsultaSobDemandaResultado | null, enviando: boolean): number {
  if (enviando) return 0;
  if (!consulta) return -1;
  if (consulta.status === "pendente") return 1;
  if (consulta.status === "processando") return 2;
  return 3;
}

export function ConsultaSobDemanda({
  codigoIbge,
  anoInicial,
  mesInicial,
}: {
  codigoIbge: string;
  anoInicial?: string;
  mesInicial?: string;
}) {
  const hoje = useMemo(() => new Date(), []);
  const anoAtual = hoje.getFullYear();
  const anosDisponiveis = useMemo(
    () => Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, i) => PRIMEIRO_ANO + i),
    [anoAtual]
  );
  const periodoInicial = useMemo(
    () => periodoDaUrl(anoInicial, mesInicial, hoje),
    [anoInicial, mesInicial, hoje]
  );

  const [ano, setAno] = useState(periodoInicial?.ano ?? anoAtual);
  const [mes, setMes] = useState(() => periodoInicial?.mes ?? primeiroMesDisponivel(anoAtual, hoje));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [consultaId, setConsultaId] = useState<number | null>(null);
  const [consulta, setConsulta] = useState<ConsultaSobDemandaResultado | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  // Período do resultado na tela — separado dos seletores, que a pessoa pode
  // mexer depois: rótulos, texto alternativo e URL seguem o resultado, não o
  // seletor.
  const [periodoResultado, setPeriodoResultado] = useState<{ ano: number; mes: number } | null>(null);
  const tentativasRef = useRef(0);

  // Link reproduzível: abrir /municipio/X?ano=&mes= mostra o resultado se ele
  // já foi calculado — só leitura, nunca dispara cálculo (seção 6.52).
  useEffect(() => {
    if (!periodoInicial) return;
    const controle = new AbortController();
    const busca = new URLSearchParams({
      codigoIbge,
      ano: String(periodoInicial.ano),
      mes: String(periodoInicial.mes),
    });
    fetch(`/api/consultas?${busca}`, { signal: controle.signal })
      .then(async (resposta) => {
        if (resposta.ok) {
          const dados = await resposta.json();
          setPeriodoResultado(periodoInicial);
          setConsultaId(dados.id);
          setConsulta(dados);
        } else if (resposta.status === 404) {
          setAviso(
            `${NOMES_MESES[periodoInicial.mes - 1]}/${periodoInicial.ano} ainda não foi calculado para este município. Clique em Calcular.`
          );
        }
      })
      .catch(() => {
        // falha de rede ao abrir o link: o formulário continua funcionando
      });
    return () => controle.abort();
  }, [codigoIbge, periodoInicial]);

  useEffect(() => {
    if (!consultaId || !consulta) return;
    if (consulta.status !== "pendente" && consulta.status !== "processando") return;

    const intervalo = setInterval(async () => {
      tentativasRef.current += 1;
      if (tentativasRef.current > LIMITE_TENTATIVAS_POLLING) {
        clearInterval(intervalo);
        setErro("Isso está demorando mais do que o esperado. Tente de novo mais tarde.");
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

  // Mantém a URL da página em sincronia com o período do resultado mostrado,
  // pra "copiar link" (ou o endereço do navegador) reproduzir a mesma análise.
  useEffect(() => {
    if (consulta?.status !== "concluido" || !periodoResultado) return;
    const url = new URL(window.location.href);
    url.searchParams.set("ano", String(periodoResultado.ano));
    url.searchParams.set("mes", String(periodoResultado.mes));
    window.history.replaceState(null, "", url);
  }, [consulta?.status, periodoResultado]);

  function selecionarAno(novoAno: number) {
    setAno(novoAno);
    if (!mesEstaDisponivel(novoAno, mes, hoje)) {
      setMes(primeiroMesDisponivel(novoAno, hoje));
    }
  }

  async function calcular() {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    setConsulta(null);
    setConsultaId(null);
    setLinkCopiado(false);
    setPeriodoResultado({ ano, mes });
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

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopiado(true);
    } catch {
      setLinkCopiado(false);
    }
  }

  const emAndamento = consulta?.status === "pendente" || consulta?.status === "processando";
  const etapa = etapaAtual(consulta, enviando);
  const rotuloPeriodo = periodoResultado
    ? `${NOMES_MESES[periodoResultado.mes - 1]}/${periodoResultado.ano}`
    : `${NOMES_MESES[mes - 1]}/${ano}`;

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

      {aviso && !consulta && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">{aviso}</p>
      )}

      {erro && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
          {erro}
          {consultaId && <span className="mt-1 block text-faint">Código para suporte: consulta #{consultaId}</span>}
        </p>
      )}

      {etapa >= 0 && etapa < 3 && (
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-live="polite">
          {ETAPAS.map((nome, i) => (
            <li
              key={nome}
              aria-current={i === etapa ? "step" : undefined}
              className={i < etapa ? "text-muted" : i === etapa ? "font-semibold text-foreground" : "text-faint"}
            >
              {i < etapa ? "✓" : i === etapa ? "●" : "○"} {nome}
              {i === etapa && i < 3 && (
                <span
                  className="ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-acento border-t-transparent align-[-2px]"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {emAndamento && (
        <p className="text-xs text-muted">
          Calculando {rotuloPeriodo} · consulta #{consultaId}. Pode sair desta página: o resultado
          fica guardado e aparece de novo pelo link.
        </p>
      )}

      {consulta?.status === "erro" && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
          {consulta.mensagemErro ?? "Não foi possível concluir o cálculo."}
          <span className="mt-1 block text-faint">Código para suporte: consulta #{consulta.id}</span>
        </p>
      )}

      {consulta?.status === "concluido" && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">
              Resultado de {rotuloPeriodo} · consulta #{consulta.id}
            </p>
            <button
              type="button"
              onClick={copiarLink}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:border-acento/40"
            >
              {linkCopiado ? "Link copiado ✓" : "Copiar link da análise"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoTile
              rotulo="Focos de calor"
              valor={consulta.numFocosCalor ?? "—"}
              explicacao="Focos de calor do INPE detectados nesse município, nesse mês, pelo satélite de referência (o mesmo que a pesquisa usa). Foco de calor não é incêndio confirmado: é um ponto quente visto pelo satélite."
            />
            <InfoTile
              rotulo="Agrupamentos"
              valor={consulta.numAgrupamentos ?? "—"}
              explicacao="Quantos agrupamentos espaço-temporais (focos a até 3 km e 1 dia uns dos outros, com pelo menos 4 focos) o método formou nesse mês. Um agrupamento pode ser um ou mais episódios de queima."
            />
            <InfoTile
              rotulo="Área (agrupamento)"
              valor={formatKm2(consulta.areaStDbscanKm2)}
              explicacao="Soma das áreas de influência dos agrupamentos (raio de 3 km em volta de cada foco agrupado), em km². Não é área queimada: pode passar da área do município."
            />
            <InfoTile
              rotulo="Área (satélite)"
              valor={formatKm2(consulta.areaDnbrKm2)}
              explicacao="Área dentro do município com dNBR de pelo menos 0,10 (Sentinel-2), comparando o mês anterior com o mês escolhido. Fica sem valor quando a imagem disponível tinha nuvem demais sobre o município."
            />
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            Cálculo automático, com o satélite de referência do INPE (
            <Link href="/como-produzimos#parametros" className="underline">
              como é feito
            </Link>
            ).
          </p>
          {consulta.dnbrImagemUrl && (
            <ImagemComFallback
              src={consulta.dnbrImagemUrl}
              alt={`Mapa de severidade de queimada (dNBR) deste município em ${rotuloPeriodo}: verde é dNBR de até 0,10, passando por amarelo, laranja e vermelho até preto, 0,70 ou mais.`}
              className="h-auto w-full rounded-xl border border-border"
              mensagemFallback="Não foi possível carregar o mapa desta consulta agora."
            />
          )}
        </div>
      )}
    </section>
  );
}
