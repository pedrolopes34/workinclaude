import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMunicipioDetalhe } from "@/lib/queries";
import { CONFIABILIDADE_STYLE, formatKm2, formatPct, formatPValor } from "@/lib/format";

// Único município com imagem real de mapa dNBR disponível hoje — o
// pipeline (run_dnbr.py) calcula área direto no servidor do GEE, nunca
// exportou raster/imagem em produção (docs/DECISIONS.md seção 7). Esta é
// a imagem real da pesquisa original (ago/2024), não um mock.
const CODIGO_IBGE_COM_MAPA_REAL = "3539509"; // Pitangueiras

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
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
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

      {!municipio.naAmostra ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-stone-600 shadow-sm dark:text-stone-400">
          Este município ainda não está na amostra validada pela pesquisa —
          não comparado/validado.
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-stone-600">
            Confiabilidade por ano
          </h2>
          {validacoes.length === 0 ? (
            <p className="text-sm text-stone-600">
              Município na amostra, mas sem comparação registrada ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {validacoes.map((v) => (
                <div
                  key={v.ano}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm text-stone-600">{v.ano}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-[19px] font-bold ${CONFIABILIDADE_STYLE[v.confiabilidade].bg} ${CONFIABILIDADE_STYLE[v.confiabilidade].text}`}
                    >
                      {CONFIABILIDADE_STYLE[v.confiabilidade].label}
                    </span>
                  </div>

                  <div className="mb-4 overflow-hidden rounded-xl border border-border bg-background">
                    {municipio.codigoIbge === CODIGO_IBGE_COM_MAPA_REAL ? (
                      <>
                        <Image
                          src="/dnbr-pitangueiras.png"
                          alt={`Mapa de severidade de queimada (dNBR) de ${municipio.nome} em ${v.ano}, estilo QGIS: verde é baixa severidade (perto de 0,10), do amarelo ao vermelho é severidade alta (até 0,75).`}
                          width={1400}
                          height={1244}
                          className="h-auto w-full"
                        />
                        <p className="px-3 py-2 text-xs text-stone-600">
                          Mapa dNBR · Sentinel-2/ESA, processado no Google Earth Engine
                        </p>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 px-4 py-10 text-center text-xs text-stone-600">
                        <span>Mapa dNBR ainda não disponível para este município</span>
                        <span className="text-stone-400">
                          o pipeline hoje calcula a área direto no servidor, sem exportar imagem
                        </span>
                      </div>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-stone-600">Recall</dt>
                      <dd className="font-mono text-foreground">{formatPct(v.recallPct)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-600">Interseção</dt>
                      <dd className="font-mono text-foreground">{formatPct(v.interseccaoPct, 2)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-600">valor-p</dt>
                      <dd className="font-mono text-foreground">{formatPValor(v.pValor)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-600">Área MapBiomas</dt>
                      <dd className="font-mono text-foreground">{formatKm2(v.areaMapbiomasKm2)}</dd>
                    </div>
                  </dl>
                  {v.validacaoTemporal && (
                    <p className="mt-4 text-xs text-stone-600">
                      {v.validacaoTemporal}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    Comparado contra MapBiomas Fogo {v.mapbiomasColecao}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h2 className="pt-2 text-sm font-medium text-stone-600">
            Focos de calor e agrupamentos
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-600">
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
