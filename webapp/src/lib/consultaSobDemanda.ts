import { sql } from "./db";
import { urlPublicaDnbr } from "./imagensR2";
import type { ConsultaSobDemanda } from "./types";

// Consulta ad-hoc de 1 município x 1 mês, calculada ao vivo via GitHub
// Actions quando o visitante pede (docs/DECISIONS.md seção 6.43). Este
// módulo é o único lugar que sabe como validar o período, checar limite de
// taxa e disparar o workflow — a rota em app/api/consultas só orquestra.

// 2018-2023 ainda não têm o histórico do INPE integrado (BDQueimadas, ver
// docs/DECISIONS.md seção 7) — lançado só pra 2024 em diante por ora.
export const PRIMEIRO_ANO_CONSULTA = 2024;
export const MAX_CONSULTAS_POR_HORA = 5;

const GITHUB_OWNER = "pedrolopes34";
const GITHUB_REPO = "workinclaude";
const WORKFLOW_FILE = "consulta-sob-demanda.yml";

export function anoMaximoConsulta(): number {
  return new Date().getUTCFullYear();
}

export function validarPeriodo(
  ano: number,
  mes: number
): { ok: true } | { ok: false; motivo: string } {
  const anoMax = anoMaximoConsulta();
  if (!Number.isInteger(ano) || ano < PRIMEIRO_ANO_CONSULTA || ano > anoMax) {
    return {
      ok: false,
      motivo: `Ano precisa estar entre ${PRIMEIRO_ANO_CONSULTA} e ${anoMax} — 2018–2023 ainda não têm o histórico do INPE integrado.`,
    };
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { ok: false, motivo: "Mês inválido." };
  }
  // O mês alvo precisa ter terminado de verdade — janela_mes_especifico()
  // (pipeline/run_dnbr.py) usa o mês inteiro como "depois", não "até hoje"
  // como o cron mensal faz para o mês corrente.
  const inicioProximoMes =
    mes === 12 ? Date.UTC(ano + 1, 0, 1) : Date.UTC(ano, mes, 1);
  if (inicioProximoMes > Date.now()) {
    return { ok: false, motivo: "Esse mês ainda não terminou — escolha um mês já encerrado." };
  }
  return { ok: true };
}

// Migração idempotente do lado do /webapp — diferente das outras tabelas
// (sempre criadas pelo /pipeline antes do webapp ler), aqui o /webapp
// escreve a PRIMEIRA linha, antes do pipeline rodar. schema.sql continua
// sendo a fonte de verdade (docs/DECISIONS.md seção 6.43); isso só cobre
// quem ainda não aplicou a migração manual no Neon.
export async function garantirTabelaConsultas(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS consultas_sob_demanda (
      id                  BIGSERIAL PRIMARY KEY,
      codigo_ibge         CHAR(7) NOT NULL REFERENCES municipios (codigo_ibge),
      ano                 SMALLINT NOT NULL,
      mes                 SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
      status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
      num_focos_calor     INT,
      num_agrupamentos    INT,
      area_st_dbscan_km2  NUMERIC(10, 2),
      area_dnbr_km2       NUMERIC(10, 2),
      dnbr_imagem_url     TEXT,
      mensagem_erro       TEXT,
      ip_solicitante      TEXT,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      concluido_em        TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_consultas_sob_demanda_ip_criado
    ON consultas_sob_demanda (ip_solicitante, criado_em DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_consultas_sob_demanda_municipio_periodo
    ON consultas_sob_demanda (codigo_ibge, ano, mes, status)
  `;
}

// id::int (nao so' "id"): BIGSERIAL vem do driver postgres.js como STRING
// por padrao (evita perda de precisao em bigint) — confirmado testando de
// verdade contra Postgres local (docs/DECISIONS.md secao 6.43), nao so'
// suposicao. Cast pra int (nunca teremos 2 bilhoes de consultas) devolve
// number de verdade, batendo com o tipo ConsultaSobDemanda.id.
const COLUNAS_CONSULTA = sql`
  id::int AS id, status, num_focos_calor, num_agrupamentos, area_st_dbscan_km2,
  area_dnbr_km2, dnbr_imagem_url, mensagem_erro
`;

// Reaproveita um resultado já calculado pro mesmo município+ano+mês em vez
// de disparar outro workflow — economiza cota do GEE/minutos do Actions em
// consultas repetidas (ex.: todo mundo curioso sobre "Pitangueiras, ago/2024").
export async function buscarConsultaConcluida(
  codigoIbge: string,
  ano: number,
  mes: number
): Promise<ConsultaSobDemanda | null> {
  const [linha] = await sql<ConsultaSobDemanda[]>`
    SELECT ${COLUNAS_CONSULTA}
    FROM consultas_sob_demanda
    WHERE codigo_ibge = ${codigoIbge} AND ano = ${ano} AND mes = ${mes} AND status = 'concluido'
    ORDER BY criado_em DESC
    LIMIT 1
  `;
  return linha ? { ...linha, dnbrImagemUrl: urlPublicaDnbr(linha.dnbrImagemUrl) } : null;
}

export async function buscarConsultaPorId(id: number): Promise<ConsultaSobDemanda | null> {
  const [linha] = await sql<ConsultaSobDemanda[]>`
    SELECT ${COLUNAS_CONSULTA}
    FROM consultas_sob_demanda
    WHERE id = ${id}
  `;
  return linha ? { ...linha, dnbrImagemUrl: urlPublicaDnbr(linha.dnbrImagemUrl) } : null;
}

// Se o runner do Actions nunca pegar o job (ex.: cota de minutos esgotada, seção
// 6.49), ninguém marca a linha — sem isto ela fica "pendente" pra sempre.
// Os 8 min precisam ficar abaixo da janela de polling de ConsultaSobDemanda.tsx.
export async function expirarSeTravada(id: number): Promise<void> {
  await sql`
    UPDATE consultas_sob_demanda
    SET status = 'erro',
        mensagem_erro = 'O cálculo não chegou a terminar — o servidor de processamento pode estar indisponível agora. Tente de novo mais tarde.',
        concluido_em = now()
    WHERE id = ${id}
      AND status IN ('pendente', 'processando')
      AND criado_em < now() - interval '8 minutes'
  `;
}

export async function contarConsultasRecentes(ip: string): Promise<number> {
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM consultas_sob_demanda
    WHERE ip_solicitante = ${ip} AND criado_em > now() - interval '1 hour'
  `;
  return total;
}

export async function criarConsultaPendente(
  codigoIbge: string,
  ano: number,
  mes: number,
  ip: string
): Promise<number> {
  const [{ id }] = await sql<{ id: number }[]>`
    INSERT INTO consultas_sob_demanda (codigo_ibge, ano, mes, ip_solicitante)
    VALUES (${codigoIbge}, ${ano}, ${mes}, ${ip})
    RETURNING id::int AS id
  `;
  return id;
}

export async function marcarConsultaComoErro(id: number, mensagem: string): Promise<void> {
  await sql`
    UPDATE consultas_sob_demanda
    SET status = 'erro', mensagem_erro = ${mensagem}, concluido_em = now()
    WHERE id = ${id}
  `;
}

// GITHUB_DISPATCH_TOKEN: fine-grained PAT (Actions: read/write, só neste
// repositório), gerado pelo Pedro e configurado nas env vars da Vercel —
// esta sessão não consegue criar o token sozinha (docs/DECISIONS.md seção 6.43).
export async function dispararConsultaWorkflow(params: {
  consultaId: number;
  codigoIbge: string;
  ano: number;
  mes: number;
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    throw new Error("GITHUB_DISPATCH_TOKEN não configurado no ambiente do /webapp.");
  }

  const resposta = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          consulta_id: String(params.consultaId),
          municipio: params.codigoIbge,
          ano: String(params.ano),
          mes: String(params.mes),
        },
      }),
    }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`GitHub API recusou o disparo (${resposta.status}): ${corpo}`);
  }
}
