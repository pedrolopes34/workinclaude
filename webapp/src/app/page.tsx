import { Suspense } from "react";
import Link from "next/link";
import { listMunicipios, contarMunicipios } from "@/lib/queries";
import { CONFIABILIDADE_STYLE } from "@/lib/format";

// Suspense fica só em torno desta lista, nao na rota inteira — assim
// /municipio/[codigoIbge] (que precisa de notFound() virar 404 de
// verdade) nao herda um boundary de streaming da rota raiz.
async function ListaMunicipios({ termo }: { termo?: string }) {
  const [municipios, contagem] = await Promise.all([
    listMunicipios(termo),
    contarMunicipios(),
  ]);

  return (
    <>
      <p className="text-sm text-stone-600">
        {contagem.naAmostra} de {contagem.total} municípios já validados
        pela pesquisa
      </p>

      <section className="space-y-3">
        {!termo && (
          <h2 className="text-sm font-medium text-stone-600">
            Municípios da amostra validada
          </h2>
        )}
        {municipios.length === 0 ? (
          <p className="text-sm text-stone-600">
            Nenhum município encontrado para &ldquo;{termo}&rdquo;.
          </p>
        ) : (
          <ul className="space-y-2">
            {municipios.map((m) => (
              <li key={m.codigoIbge}>
                <Link
                  href={`/municipio/${m.codigoIbge}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-colors hover:border-acento/40"
                >
                  <div>
                    <p className="font-medium text-foreground">{m.nome}</p>
                    {m.mesorregiao && (
                      <p className="text-xs text-stone-600">{m.mesorregiao}</p>
                    )}
                  </div>
                  {m.confiabilidade ? (
                    <span
                      className={`rounded-full px-3 py-1 text-[19px] font-bold ${CONFIABILIDADE_STYLE[m.confiabilidade].bg} ${CONFIABILIDADE_STYLE[m.confiabilidade].text}`}
                    >
                      {CONFIABILIDADE_STYLE[m.confiabilidade].label}
                    </span>
                  ) : (
                    <span className="rounded-full border border-border px-3 py-1 text-xs text-stone-600">
                      não comparado/validado
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ListaSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-1/3 rounded-lg bg-surface" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Monitoramento de queimadas em São Paulo
        </h1>
        <p className="max-w-xl text-stone-600 dark:text-stone-400">
          Cruzamos duas fontes independentes de satélite — agrupamento de
          focos de calor e leitura de satélite (severidade de queima) — e
          comparamos o resultado ao MapBiomas Fogo para mostrar, em
          linguagem simples, o quanto dá para confiar em cada município.
        </p>
      </section>

      <form method="get" className="flex gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar município (ex.: Pitangueiras)"
          className="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-none placeholder:text-stone-400"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-acento px-4 py-2 text-[19px] font-bold text-white transition-colors hover:bg-acento-hover"
        >
          Buscar
        </button>
      </form>

      <Suspense key={q ?? ""} fallback={<ListaSkeleton />}>
        <ListaMunicipios termo={q} />
      </Suspense>
    </div>
  );
}
