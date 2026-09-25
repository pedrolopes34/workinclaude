import Link from "next/link";
import { listMunicipios, contarMunicipios } from "@/lib/queries";
import { CONFIABILIDADE_STYLE } from "@/lib/format";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [municipios, contagem] = await Promise.all([
    listMunicipios(q),
    contarMunicipios(),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Monitoramento de queimadas em São Paulo
        </h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Cruzamos duas fontes independentes de satélite — agrupamento de
          focos de calor e leitura de satélite (severidade de queima) — e
          comparamos o resultado ao MapBiomas Fogo para mostrar, em
          linguagem simples, o quanto dá para confiar em cada município.
        </p>
        <p className="font-mono text-sm text-zinc-500">
          {contagem.naAmostra} de {contagem.total} municípios já validados
          pela pesquisa
        </p>
      </section>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar município (ex.: Pitangueiras)"
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-azul focus:ring-1 focus:ring-azul dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      <section>
        {!q && (
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-zinc-500">
            Municípios da amostra validada
          </h2>
        )}
        {municipios.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum município encontrado para &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {municipios.map((m) => (
              <li key={m.codigoIbge}>
                <Link
                  href={`/municipio/${m.codigoIbge}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div>
                    <p className="font-medium">{m.nome}</p>
                    {m.mesorregiao && (
                      <p className="text-xs text-zinc-500">{m.mesorregiao}</p>
                    )}
                  </div>
                  {m.confiabilidade ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${CONFIABILIDADE_STYLE[m.confiabilidade].bg} ${CONFIABILIDADE_STYLE[m.confiabilidade].text}`}
                    >
                      {CONFIABILIDADE_STYLE[m.confiabilidade].label}
                    </span>
                  ) : (
                    <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-700">
                      não comparado/validado
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
