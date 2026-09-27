import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMunicipioDetalhe } from "@/lib/queries";
import { CONFIABILIDADE_STYLE, formatKm2, formatPct, formatPValor } from "@/lib/format";
import { InfoTile } from "@/components/InfoTile";
import { ConsultaSobDemanda } from "@/components/ConsultaSobDemanda";
import type { MetricasAnuais } from "@/lib/types";

const PRIMEIRO_ANO_VALIDACAO = 2018; // período inicial de validação da pesquisa (docs/DECISIONS.md)

// Barra de comparação (método próprio × satélite × MapBiomas) — mesma
// ideia do mockup (docs/DECISIONS.md seção 6.38), com as 3 áreas que já
// existem no banco (metricas_anuais + validacao_mapbiomas).
function BarraComparacao({
  metodoKm2,
  satelliteKm2,
  mapbiomasKm2,
}: {
  metodoKm2: string | null;
  satelliteKm2: string | null;
  mapbiomasKm2: string | null;
}) {
  const paraNumero = (v: string | null) => (v === null ? 0 : Number(v));
  const valores = [
    { nome: "Método próprio", valor: metodoKm2, cor: "bg-verde" },
    { nome: "Satélite", valor: satelliteKm2, cor: "bg-acento" },
    { nome: "MapBiomas", valor: mapbiomasKm2, cor: "bg-mostarda" },
  ];
  const max = Math.max(1, ...valores.map((v) => paraNumero(v.valor)));

  return (
    <div className="space-y-2">
      {valores.map((v) => (
        <div key={v.nome} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted">{v.nome}</span>
          <div className="h-3.5 flex-1 overflow-hidden rounded-full border border-border bg-background">
            <div
              className={`h-full rounded-full ${v.cor}`}
              style={{ width: `${(paraNumero(v.valor) / max) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold text-foreground">
            {formatKm2(v.valor)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Fallback: imagem real da pesquisa original (Pitangueiras, ago/2024) —
// usada só se este município nunca tiver rodado no pipeline de dNBR
// (docs/DECISIONS.md seção 7/6.40). Na prática já não deveria disparar
// pra Pitangueiras (tem imagem real do pipeline desde a seção 6.44), mas
// não custa manter como rede de segurança.
const CODIGO_IBGE_COM_MAPA_REAL = "3539509"; // Pitangueiras

// Mapa dNBR mais recente — camada operacional (docs/DECISIONS.md seção
// 1.1/6.14): atualiza mensal/diariamente e sempre grava no ANO CORRENTE,
// nunca no ano de uma validação MapBiomas (retrospectiva, capada em
// 2024 — seção 6.22). Por isso busca a miniatura mais recente disponível
// em qualquer ano de metricas_anuais, em vez de exigir que bata com o ano
// de alguma validação — a busca antiga fazia isso e o mapa nunca aparecia
// pra ninguém (bug real reportado pelo Pedro, seção 6.45).
function MapaDnbrAtual({
  nomeMunicipio,
  codigoIbge,
  metricas,
}: {
  nomeMunicipio: string;
  codigoIbge: string;
  metricas: MetricasAnuais[];
}) {
  const maisRecente = metricas.find((m) => m.dnbrImagemUrl);
  const imagemUrl =
    maisRecente?.dnbrImagemUrl ??
    (codigoIbge === CODIGO_IBGE_COM_MAPA_REAL ? "/dnbr-pitangueiras.png" : null);
  const rotuloAno = maisRecente ? String(maisRecente.ano) : "ago/2024";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {imagemUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL vem do R2 (domínio dinâmico), plain <img> evita depender de next.config.ts saber o domínio de antemão */}
          <img
            src={imagemUrl}
            alt={`Mapa de severidade de queimada (dNBR) de ${nomeMunicipio}, ${rotuloAno}, estilo QGIS: verde é baixa severidade (perto de 0,10), do amarelo ao vermelho é severidade alta (até 0,75).`}
            loading="lazy"
            className="h-auto w-full"
          />
          <div className="flex items-center gap-2 px-3 py-2">
            <span
              className="h-2 flex-1 max-w-32 rounded-full"
              style={{
                background: "linear-gradient(to right, #1d5e38, #5b9e4d, #d9d94a, #d9a441, #c1442d)",
              }}
              aria-hidden="true"
            />
            <span className="text-[11px] text-faint">−0,25 a 0,75 (dNBR)</span>
          </div>
          <p className="border-t border-border px-3 py-2 text-xs text-muted">
            Mapa dNBR mais recente ({rotuloAno}) · Sentinel-2/ESA, processado no Google Earth Engine
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center text-xs text-muted">
          <span>Mapa dNBR ainda não disponível para este município</span>
          <span className="text-faint">aparece assim que o pipeline mensal processar este município</span>
        </div>
      )}
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoIbge: string }>;
}): Promise<Metadata> {
  const { codigoIbge } = await params;
  const detalhe = await getMunicipioDetalhe(codigoIbge);

  if (!detalhe) return { title: "Município não encontrado" };

  const ultimaValidacao = detalhe.validacoes[0];
  const descricao = ultimaValidacao
    ? `Confiabilidade ${ultimaValidacao.confiabilidade} (${ultimaValidacao.ano}) — agrupamento de focos de calor + leitura de satélite comparado ao MapBiomas Fogo.`
    : `${detalhe.municipio.nome} ainda não foi comparado ao MapBiomas Fogo.`;

  return {
    title: `${detalhe.municipio.nome} — Painel de Queimadas SP`,
    description: descricao,
  };
}

export default async function MunicipioPage({
  params,
}: {
  params: Promise<{ codigoIbge: string }>;
}) {
  const { codigoIbge } = await params;
  const detalhe = await getMunicipioDetalhe(codigoIbge);

  if (!detalhe) notFound();

  const { municipio, metricas, validacoes } = detalhe;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-[19px] font-bold text-acento hover:underline">
          ← voltar para a busca
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {municipio.nome}
        </h1>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <div>
            <dt className="inline">código IBGE </dt>
            <dd className="inline font-mono">{municipio.codigoIbge}</dd>
          </div>
          {municipio.mesorregiao && (
            <div>
              <dt className="inline">mesorregião </dt>
              <dd className="inline">{municipio.mesorregiao}</dd>
            </div>
          )}
          {municipio.areaKm2 && (
            <div>
              <dt className="inline">área </dt>
              <dd className="inline">{formatKm2(municipio.areaKm2)}</dd>
            </div>
          )}
          {municipio.bioma && (
            <div>
              <dt className="inline">bioma </dt>
              <dd className="inline">{municipio.bioma}</dd>
            </div>
          )}
        </dl>
      </header>

      <ConsultaSobDemanda codigoIbge={municipio.codigoIbge} />

      <MapaDnbrAtual
        nomeMunicipio={municipio.nome}
        codigoIbge={municipio.codigoIbge}
        metricas={metricas}
      />

      {!municipio.naAmostra ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted shadow-sm">
          Este município ainda não está na amostra validada pela pesquisa —
          não comparado/validado.
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted">
            Confiabilidade por ano
          </h2>

          <div className="flex flex-wrap gap-1.5">
            {Array.from(
              { length: new Date().getFullYear() - PRIMEIRO_ANO_VALIDACAO + 1 },
              (_, i) => PRIMEIRO_ANO_VALIDACAO + i
            ).map((ano) => {
              const validado = validacoes.some((v) => v.ano === ano);
              return (
                <div
                  key={ano}
                  className={`flex w-12 flex-col items-center gap-1 rounded-lg border px-1 py-1.5 ${
                    validado ? "border-mostarda/50 bg-mostarda/10" : "border-border bg-surface"
                  }`}
                  title={validado ? `${ano}: validado` : `${ano}: sem dado ainda`}
                >
                  <span className={`font-mono text-xs font-semibold ${validado ? "text-foreground" : "text-faint"}`}>
                    &apos;{String(ano).slice(2)}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${validado ? "bg-mostarda" : "bg-stone-300"}`} />
                </div>
              );
            })}
          </div>

          {validacoes.length === 0 ? (
            <p className="text-sm text-muted">
              Município na amostra, mas sem comparação registrada ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {validacoes.map((v) => {
                return (
                <div
                  key={v.ano}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-muted">{v.ano}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-[19px] font-bold ${CONFIABILIDADE_STYLE[v.confiabilidade].bg} ${CONFIABILIDADE_STYLE[v.confiabilidade].text}`}
                    >
                      {CONFIABILIDADE_STYLE[v.confiabilidade].label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <InfoTile
                      rotulo="Recall"
                      valor={formatPct(v.recallPct)}
                      explicacao="Do que o MapBiomas considera área queimada, quanto o nosso método também encontrou. Recall alto = o método não está deixando passar queima real."
                    />
                    <InfoTile
                      rotulo="Interseção"
                      valor={formatPct(v.interseccaoPct, 2)}
                      explicacao="O quanto a área do nosso método coincide, pixel a pixel, com a área do MapBiomas. Costuma ficar baixa mesmo com Recall alto — são medidas diferentes, mostramos as duas por transparência."
                    />
                    <InfoTile
                      rotulo="valor-p"
                      valor={formatPValor(v.pValor)}
                      explicacao="Mede se essa coincidência espacial poderia ter acontecido por acaso. Abaixo de 0,05 conta como estatisticamente significativa (um dos 2 critérios da confiabilidade)."
                    />
                    <InfoTile
                      rotulo="Área MapBiomas"
                      valor={formatKm2(v.areaMapbiomasKm2)}
                      explicacao="Área queimada nesse ano segundo o MapBiomas Fogo — a terceira fonte independente usada como comparação."
                    />
                  </div>

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium text-muted">
                      Área comparada · {v.ano}
                    </p>
                    <BarraComparacao
                      metodoKm2={metricas.find((m) => m.ano === v.ano)?.areaStDbscanKm2 ?? null}
                      satelliteKm2={metricas.find((m) => m.ano === v.ano)?.areaDnbrKm2 ?? null}
                      mapbiomasKm2={v.areaMapbiomasKm2}
                    />
                  </div>

                  {v.validacaoTemporal && (
                    <p className="mt-4 text-xs text-muted">
                      {v.validacaoTemporal}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    Comparado contra MapBiomas Fogo {v.mapbiomasColecao}
                  </p>
                </div>
                );
              })}
            </div>
          )}

          <h2 className="pt-2 text-sm font-medium text-muted">
            Focos de calor e agrupamentos
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Ano</th>
                  <th className="px-4 py-3 font-medium">Focos de calor</th>
                  <th className="px-4 py-3 font-medium">Agrupamentos</th>
                  <th className="px-4 py-3 font-medium">Área (agrupamento)</th>
                  <th className="px-4 py-3 font-medium">Área (leitura de satélite)</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((m) => (
                  <tr key={m.ano} className="border-t border-border">
                    <td className="px-4 py-3 font-mono">{m.ano}</td>
                    <td className="px-4 py-3">{m.numFocosCalor ?? "—"}</td>
                    <td className="px-4 py-3">{m.numAgrupamentos ?? "—"}</td>
                    <td className="px-4 py-3">{formatKm2(m.areaStDbscanKm2)}</td>
                    <td className="px-4 py-3">{formatKm2(m.areaDnbrKm2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
