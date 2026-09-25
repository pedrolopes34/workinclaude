import Link from "next/link";
import { notFound } from "next/navigation";
import { getMunicipioDetalhe } from "@/lib/queries";
import { CONFIABILIDADE_STYLE, formatKm2, formatPct, formatPValor } from "@/lib/format";

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
        <Link href="/" className="text-sm text-azul hover:underline">
          ← voltar para a busca
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {municipio.nome}
        </h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-zinc-500">
          <div>
            <dt className="inline">código IBGE </dt>
            <dd className="inline">{municipio.codigoIbge}</dd>
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
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Este município ainda não está na amostra validada pela pesquisa —
          não comparado/validado.
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-zinc-500">
            Confiabilidade por ano
          </h2>
          {validacoes.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Município na amostra, mas sem comparação registrada ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {validacoes.map((v) => (
                <div
                  key={v.ano}
                  className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-sm text-zinc-500">
                      {v.ano}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${CONFIABILIDADE_STYLE[v.confiabilidade].bg} ${CONFIABILIDADE_STYLE[v.confiabilidade].text}`}
                    >
                      {CONFIABILIDADE_STYLE[v.confiabilidade].label}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-zinc-500">Recall</dt>
                      <dd className="font-mono">{formatPct(v.recallPct)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Interseção</dt>
                      <dd className="font-mono">{formatPct(v.interseccaoPct, 2)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">valor-p</dt>
                      <dd className="font-mono">{formatPValor(v.pValor)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Área MapBiomas</dt>
                      <dd className="font-mono">{formatKm2(v.areaMapbiomasKm2)}</dd>
                    </div>
                  </dl>
                  {v.validacaoTemporal && (
                    <p className="mt-3 text-xs text-zinc-500">
                      {v.validacaoTemporal}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-400">
                    Comparado contra MapBiomas Fogo {v.mapbiomasColecao}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h2 className="pt-2 font-mono text-xs uppercase tracking-wide text-zinc-500">
            Focos de calor e agrupamentos
          </h2>
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2">Ano</th>
                  <th className="px-4 py-2">Focos de calor</th>
                  <th className="px-4 py-2">Agrupamentos</th>
                  <th className="px-4 py-2">Área (agrupamento)</th>
                  <th className="px-4 py-2">Área (leitura de satélite)</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((m) => (
                  <tr key={m.ano} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-2 font-mono">{m.ano}</td>
                    <td className="px-4 py-2">{m.numFocosCalor ?? "—"}</td>
                    <td className="px-4 py-2">{m.numAgrupamentos ?? "—"}</td>
                    <td className="px-4 py-2">{formatKm2(m.areaStDbscanKm2)}</td>
                    <td className="px-4 py-2">{formatKm2(m.areaDnbrKm2)}</td>
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
