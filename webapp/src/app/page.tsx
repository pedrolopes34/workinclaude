import { Suspense } from "react";
import Link from "next/link";
import {
  NIVEIS_CONFIABILIDADE,
  contarPorConfiabilidade,
  getResumoCobertura,
  listMunicipios,
  listarMunicipiosNoMapa,
} from "@/lib/queries";
import { formatData, rotuloJanelaDnbr } from "@/lib/format";
import type { Confiabilidade } from "@/lib/types";
import { Hero } from "@/components/Hero";
import { CAMADA_PADRAO, MapaSP, type MunicipioMapa } from "@/components/MapaSP";
import { SeloConfiabilidade } from "@/components/SeloConfiabilidade";

function lerNivel(valor?: string): Confiabilidade | undefined {
  return NIVEIS_CONFIABILIDADE.find((n) => n === valor);
}

function hrefFiltro(q: string | undefined, nivel: Confiabilidade | undefined): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (nivel) params.set("nivel", nivel);
  const busca = params.toString();
  return busca ? `/?${busca}#lista` : "/#lista";
}

// Suspense fica só em torno desta lista, nao na rota inteira — assim
// /municipio/[codigoIbge] (que precisa de notFound() virar 404 de
// verdade) nao herda um boundary de streaming da rota raiz.
async function ListaMunicipios({ termo, nivel }: { termo?: string; nivel?: Confiabilidade }) {
  const municipios = await listMunicipios(termo, nivel);

  const titulo = termo
    ? `Resultado da busca por “${termo}”${nivel ? ` · confiabilidade ${nivel}` : ""}`
    : nivel
      ? `Municípios com confiabilidade ${nivel}`
      : "Municípios da amostra validada";

  return (
    <section className="space-y-3" aria-live="polite">
      <h2 className="text-sm font-medium text-muted">
        {titulo} <span className="font-mono text-faint">({municipios.length})</span>
      </h2>
      {municipios.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted">
          Nenhum município encontrado{termo ? <> para &ldquo;{termo}&rdquo;</> : null}
          {nivel ? <> com confiabilidade {nivel}</> : null}. Dá para buscar pelo nome (com ou sem acento) ou
          pelo código IBGE.
        </p>
      ) : (
        <ul className="space-y-2">
          {municipios.map((m) => (
            <li key={m.codigoIbge}>
              <Link
                href={`/municipio/${m.codigoIbge}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-colors hover:border-acento/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{m.nome}</p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{m.codigoIbge}</span>
                    {m.mesorregiao && <> · {m.mesorregiao}</>}
                  </p>
                </div>
                {m.confiabilidade ? (
                  <SeloConfiabilidade nivel={m.confiabilidade} focavel={false} />
                ) : (
                  <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted">
                    não validado pela pesquisa
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListaSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
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
  searchParams: Promise<{ q?: string; nivel?: string }>;
}) {
  const { q, nivel: nivelBruto } = await searchParams;
  const nivel = lerNivel(nivelBruto);
  const [cobertura, contagem, todos] = await Promise.all([
    getResumoCobertura(),
    contarPorConfiabilidade(),
    listarMunicipiosNoMapa(),
  ]);
  const anoAtual = new Date().getFullYear();
  const anos = { anterior: anoAtual - 1, atual: anoAtual };
  // Prévia sem nomes (não tem dica nem link por município) — só o desenho.
  const dadosMapa: MunicipioMapa[] = todos.map((m) => ({
    codigoIbge: m.codigoIbge,
    confiabilidade: m.confiabilidade,
    focosAnoAnterior: m.focosAnoAnterior,
    focosAnoAtual: m.focosAnoAtual,
    areaDnbrKm2: m.areaDnbrKm2 === null ? null : Number(m.areaDnbrKm2),
  }));

  return (
    <div className="space-y-8">
      <Hero
        eyebrow="Monitoramento de queimadas · São Paulo"
        titulo="Onde o fogo passou e o quanto dá pra confiar nesse número."
        descricao="Cruzamos duas fontes independentes de satélite — agrupamento de focos de calor e leitura de satélite (severidade de queima) — e comparamos o resultado ao MapBiomas Fogo para mostrar, em linguagem simples, o quanto dá para confiar em cada município."
      />

      <nav aria-label="Atalhos" className="flex flex-wrap gap-2">
        <Link
          href="/mapa"
          className="rounded-full bg-acento-botao px-4 py-2 text-[19px] font-bold text-white transition-colors hover:bg-acento-botao-hover"
        >
          Explorar mapa
        </Link>
        <a
          href="#busca"
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-acento/40"
        >
          Buscar município
        </a>
        <Link
          href="/como-produzimos"
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:border-acento/40"
        >
          Como funciona?
        </Link>
      </nav>

      <section className="grid gap-4 sm:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-medium text-muted">Cobertura hoje</h2>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-4xl font-bold tracking-tight text-acento">{cobertura.naAmostra}</span>
            <span className="text-sm text-muted">de {cobertura.total} municípios validados pela pesquisa</span>
          </p>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-foreground">{cobertura.comMapaDnbr}</span>
            <span className="text-sm text-muted">com mapa de leitura de satélite (dNBR) automático</span>
          </p>
          <p className="text-xs text-faint">
            Última atualização dos dados: <span className="font-mono">{formatData(cobertura.ultimaAtualizacao)}</span>.
            Fontes: INPE, Sentinel-2/ESA e MapBiomas Fogo (<Link href="/como-produzimos#fontes" className="underline">detalhes</Link>).
          </p>
        </div>

        <Link
          href="/mapa"
          className="group block space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-acento/40"
        >
          <MapaSP
            arquivo="/mapa/sp-leve.json"
            municipios={dadosMapa}
            anos={anos}
            rotuloVegetacao={rotuloJanelaDnbr(todos.map((m) => m.dnbrImagemUrl))}
            camada={CAMADA_PADRAO}
          />
          <span className="block text-sm font-semibold text-acento-texto group-hover:underline">
            Abrir o mapa interativo, com outras camadas →
          </span>
        </Link>
      </section>

      <form
        id="busca"
        method="get"
        action="/#lista"
        role="search"
        className="flex scroll-mt-24 items-center gap-2 rounded-full border border-glass-border bg-glass p-2 pl-4 shadow-[inset_0_1px_0_var(--color-glass-hi)] backdrop-blur-xl"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0 text-faint"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <label htmlFor="campo-busca" className="sr-only">
          Buscar município pelo nome ou código IBGE
        </label>
        <input
          id="campo-busca"
          type="search"
          name="q"
          defaultValue={q}
          list="lista-municipios"
          autoComplete="off"
          placeholder="Nome ou código IBGE"
          className="w-full bg-transparent px-1 py-2 text-sm outline-none placeholder:text-faint"
        />
        {nivel && <input type="hidden" name="nivel" value={nivel} />}
        <datalist id="lista-municipios">
          {todos.map((m) => (
            <option key={m.codigoIbge} value={m.nome} />
          ))}
        </datalist>
        <button
          type="submit"
          className="shrink-0 rounded-full bg-acento-botao px-4 py-2 text-[19px] font-bold text-white transition-colors hover:bg-acento-botao-hover"
        >
          Buscar
        </button>
      </form>

      <div id="lista" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filtrar por confiabilidade" className="flex flex-wrap gap-1.5">
            <Link
              href={hrefFiltro(q, undefined)}
              aria-current={!nivel ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${!nivel ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted hover:text-foreground"}`}
            >
              Todos
            </Link>
            {NIVEIS_CONFIABILIDADE.map((n) => (
              <Link
                key={n}
                href={hrefFiltro(q, n)}
                aria-current={nivel === n ? "true" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${nivel === n ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted hover:text-foreground"}`}
              >
                {n} <span className="font-mono">{contagem[n]}</span>
              </Link>
            ))}
          </nav>
          <a
            href="/dados/municipios.csv"
            download
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:border-acento/40"
          >
            Baixar dados (CSV)
          </a>
        </div>

        <Suspense key={`${q ?? ""}|${nivel ?? ""}`} fallback={<ListaSkeleton />}>
          <ListaMunicipios termo={q} nivel={nivel} />
        </Suspense>
      </div>
    </div>
  );
}
