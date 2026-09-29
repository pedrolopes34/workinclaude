import { Suspense } from "react";
import Link from "next/link";
import {
  NIVEIS_CONFIABILIDADE,
  getResumoCobertura,
  listMunicipios,
  listarConfiabilidadePorAno,
  listarMosaicos,
  listarMunicipiosNoMapa,
} from "@/lib/queries";
import { REGRA_CONFIABILIDADE, formatData, formatPct } from "@/lib/format";
import {
  agruparConfiabilidade,
  anosComConfiabilidade,
  confiabilidadeDoAno,
  contarNiveis,
  mesDeVitrine,
} from "@/lib/mapas";
import type { Confiabilidade, ConfiabilidadeNoAno, MunicipioResumo } from "@/lib/types";
import { Hero } from "@/components/Hero";
import { BuscaMunicipio } from "@/components/BuscaMunicipio";
import { MapaConfiabilidade } from "@/components/mapas/MapaConfiabilidade";
import { MapaDnbrEstado } from "@/components/mapas/MapaDnbrEstado";
import { chaveMes, rotuloMes } from "@/lib/meses";
import { SeloConfiabilidade } from "@/components/SeloConfiabilidade";

function lerNivel(valor?: string): Confiabilidade | undefined {
  return NIVEIS_CONFIABILIDADE.find((n) => n === valor);
}

// Barrinha da Interseção (docs/DECISIONS.md seção 6.55, "a escala de IoU"):
// comprimento relativo à maior Interseção da lista, número ao lado.
function Interseccao({ valor, maximo }: { valor: string | null; maximo: number }) {
  if (valor === null) return null;
  const n = Number(valor);
  return (
    <span className="flex shrink-0 items-center gap-1.5" title="Interseção com o MapBiomas Fogo">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-background" aria-hidden="true">
        <span className="block h-full rounded-full bg-acento" style={{ width: `${Math.max(4, (n / maximo) * 100)}%` }} />
      </span>
      <span className="w-12 text-right tabular-nums text-xs text-muted">{formatPct(valor)}</span>
    </span>
  );
}

function ListaCompacta({
  municipios,
  maximo,
  comInterseccao,
  ano,
}: {
  municipios: MunicipioResumo[];
  maximo: number;
  comInterseccao: boolean;
  ano: number;
}) {
  if (municipios.length === 0) {
    return <p className="border-t border-border px-4 py-3 text-sm text-muted">Nenhum município neste nível.</p>;
  }
  return (
    <ul className="grid gap-x-4 border-t border-border px-2 py-2 sm:grid-cols-2">
      {municipios.map((m) => (
        <li key={m.codigoIbge}>
          <Link
            href={`/municipio/${m.codigoIbge}?periodo=${ano}#ano`}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-background"
          >
            <span className="truncate">{m.nome}</span>
            {comInterseccao && <Interseccao valor={m.interseccaoPct} maximo={maximo} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Um nível de confiabilidade, fechado até alguém abrir (pedido do Pedro:
// "a pessoa abre o 'Alta' e dá os de Alta") — com os 645, a lista corrida
// ficaria enorme. Dentro, ordem pela Interseção com o MapBiomas.
function GrupoNivel({
  nivel,
  municipios,
  maximo,
  aberto,
  ano,
}: {
  nivel: Confiabilidade;
  municipios: MunicipioResumo[];
  maximo: number;
  aberto: boolean;
  ano: number;
}) {
  return (
    <details
      id={`nivel-${nivel}`}
      open={aberto}
      className="group scroll-mt-24 rounded-2xl border border-border bg-surface shadow-sm"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <SeloConfiabilidade nivel={nivel} focavel={false} />
          <span className="text-sm font-semibold text-foreground">
            <span className="tabular-nums">{municipios.length}</span> município{municipios.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden max-w-sm sm:block">{REGRA_CONFIABILIDADE[nivel]}</span>
          <span aria-hidden="true" className="text-faint transition-transform group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <ListaCompacta municipios={municipios} maximo={maximo} comInterseccao={nivel !== "Insuficiente"} ano={ano} />
    </details>
  );
}

// Com busca: lista direta dos que casam. Sem busca: os 645 agrupados por
// nível (docs/DECISIONS.md seção 6.55). Sempre a classificação do ano
// escolhido no seletor (seção 6.57), não a mais recente de cada município.
async function ListaMunicipios({
  termo,
  nivelAberto,
  ano,
  doAno,
}: {
  termo?: string;
  nivelAberto?: Confiabilidade;
  ano: number;
  doAno: Map<string, ConfiabilidadeNoAno>;
}) {
  const municipios = (await listMunicipios(termo)).map((m) => {
    const v = doAno.get(m.codigoIbge);
    return {
      ...m,
      confiabilidade: v?.confiabilidade ?? null,
      interseccaoPct: v?.interseccaoPct ?? null,
      fonte: v?.fonte ?? null,
      ano: v ? ano : null,
    };
  });
  const maximo = Math.max(1, ...municipios.map((m) => (m.interseccaoPct === null ? 0 : Number(m.interseccaoPct))));

  if (termo) {
    return (
      <section className="space-y-3" aria-live="polite">
        <h2 className="text-sm font-medium text-muted">
          Resultado da busca por &ldquo;{termo}&rdquo; <span className="tabular-nums text-faint">({municipios.length})</span>
        </h2>
        {municipios.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted">
            Nenhum município encontrado para &ldquo;{termo}&rdquo;. Dá para buscar pelo nome (com ou sem acento) ou
            pelo código IBGE.
          </p>
        ) : (
          <ul className="space-y-2">
            {municipios.map((m) => (
              <li key={m.codigoIbge}>
                <Link
                  href={`/municipio/${m.codigoIbge}?periodo=${ano}#ano`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-colors hover:border-acento/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{m.nome}</p>
                    <p className="text-xs text-muted">
                      <span className="tabular-nums">{m.codigoIbge}</span>
                      {m.mesorregiao && <> · {m.mesorregiao}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden sm:block">
                      <Interseccao valor={m.interseccaoPct} maximo={maximo} />
                    </span>
                    {m.confiabilidade && <SeloConfiabilidade nivel={m.confiabilidade} focavel={false} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const doNivel = (nivel: Confiabilidade) =>
    municipios
      .filter((m) => m.confiabilidade === nivel)
      .sort(
        (a, b) =>
          (b.interseccaoPct === null ? -1 : Number(b.interseccaoPct)) -
            (a.interseccaoPct === null ? -1 : Number(a.interseccaoPct)) || a.nome.localeCompare(b.nome, "pt-BR")
      );
  const semClassificacao = municipios
    .filter((m) => !m.confiabilidade)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <section className="space-y-2.5" aria-labelledby="titulo-lista">
      <h2 id="titulo-lista" className="text-sm font-medium text-muted">
        Os {municipios.length} municípios por confiabilidade ({ano})
      </h2>
      {NIVEIS_CONFIABILIDADE.map((nivel) => (
        <GrupoNivel
          key={nivel}
          nivel={nivel}
          municipios={doNivel(nivel)}
          maximo={maximo}
          aberto={nivelAberto === nivel}
          ano={ano}
        />
      ))}
      {semClassificacao.length > 0 && (
        <details className="group rounded-2xl border border-border bg-surface shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-muted [&::-webkit-details-marker]:hidden">
            <span>
              Sem classificação ainda <span className="tabular-nums text-faint">({semClassificacao.length})</span>
            </span>
            <span aria-hidden="true" className="text-faint transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ListaCompacta municipios={semClassificacao} maximo={maximo} comInterseccao={false} ano={ano} />
        </details>
      )}
    </section>
  );
}

function ListaSkeleton() {
  return (
    <div className="animate-pulse space-y-2.5" aria-hidden="true">
      <div className="h-4 w-1/3 rounded-lg bg-surface" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 rounded-2xl bg-surface" />
      ))}
    </div>
  );
}

// Seletor do ano da confiabilidade (seção 6.57): links que trocam ?ano= e
// mantêm a busca, sem JavaScript — dá pra compartilhar a visão de um ano.
function SeletorAno({ anos, atual, termo }: { anos: number[]; atual: number; termo?: string }) {
  return (
    <nav aria-label="Ano da confiabilidade" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted">Ano:</span>
      {anos.map((a) => {
        const busca = new URLSearchParams();
        if (termo) busca.set("q", termo);
        busca.set("ano", String(a));
        return (
          <Link
            key={a}
            href={`/?${busca.toString()}#lista`}
            aria-current={a === atual ? "page" : undefined}
            scroll={false}
            className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums ${
              a === atual
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {a}
          </Link>
        );
      })}
    </nav>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nivel?: string; ano?: string }>;
}) {
  const { q, nivel: nivelBruto, ano: anoBruto } = await searchParams;
  const nivelAberto = lerNivel(nivelBruto);
  const [cobertura, todos, confiabilidades, mosaicos] = await Promise.all([
    getResumoCobertura(),
    listarMunicipiosNoMapa(),
    listarConfiabilidadePorAno(),
    listarMosaicos(),
  ]);
  // Ano da confiabilidade: o pedido na URL, ou o mais recente.
  const anosConfiabilidade = anosComConfiabilidade(confiabilidades);
  const anoConfiabilidade = anosConfiabilidade.includes(Number(anoBruto))
    ? Number(anoBruto)
    : (anosConfiabilidade.at(-1) ?? new Date().getFullYear());
  const doAno = confiabilidadeDoAno(confiabilidades, anoConfiabilidade);
  const contagem = contarNiveis(doAno);
  const porAno = agruparConfiabilidade(confiabilidades, anoConfiabilidade);
  const vitrine = mesDeVitrine(mosaicos);

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
          className="inline-flex items-center rounded-full border border-acento-botao bg-acento-botao px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-acento-botao-hover"
        >
          Explorar mapa
        </Link>
        <a
          href="#busca"
          className="inline-flex items-center rounded-full border border-border bg-surface px-5 py-2.5 text-[15px] font-semibold text-foreground transition-colors hover:border-acento/40"
        >
          Buscar município
        </a>
        <Link
          href="/como-produzimos"
          className="inline-flex items-center rounded-full border border-border bg-surface px-5 py-2.5 text-[15px] font-semibold text-foreground transition-colors hover:border-acento/40"
        >
          Como funciona?
        </Link>
      </nav>

      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
        <p className="flex items-baseline gap-2 sm:flex-col sm:gap-0">
          <span className="tabular-nums text-5xl font-bold tracking-tight text-acento">{cobertura.total}</span>
          <span className="text-sm text-muted">municípios monitorados</span>
        </p>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>
            <strong className="text-foreground">Focos de calor</strong> do INPE, atualizados todos os dias.
          </li>
          <li>
            <strong className="text-foreground">Leitura de satélite</strong> (Sentinel-2) mês a mês, do estado inteiro
            {mosaicos.length > 1 ? ` — ${mosaicos.length} meses no mapa` : ""}.
          </li>
          <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-foreground">Confiabilidade {anoConfiabilidade}:</strong>
            {NIVEIS_CONFIABILIDADE.map((n) => (
              <Link
                key={n}
                href={`/?ano=${anoConfiabilidade}&nivel=${encodeURIComponent(n)}#nivel-${n}`}
                className="hover:underline"
              >
                <span className="tabular-nums">{contagem[n]}</span> {n}
              </Link>
            ))}
          </li>
          <li className="pt-1 text-xs text-faint">
            Última atualização: <span className="tabular-nums">{formatData(cobertura.ultimaAtualizacao)}</span>. Fontes:
            INPE, Sentinel-2/ESA e MapBiomas Fogo (
            <Link href="/como-produzimos#fontes" className="underline">
              detalhes
            </Link>
            ).
          </li>
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Mapas do estado">
        <Link
          href={vitrine ? `/mapa?mes=${chaveMes(vitrine)}` : "/mapa"}
          className="group block space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-acento/40"
        >
          <MapaDnbrEstado
            arquivo="/mapa/sp-leve.json"
            mosaicos={vitrine ? [vitrine] : []}
            chave={vitrine ? chaveMes(vitrine) : ""}
            compacto
            controles={false}
          />
          <span className="block text-sm font-semibold text-acento-texto group-hover:underline">
            {vitrine ? `Ver ${rotuloMes(vitrine)} e os outros meses →` : "Abrir o mapa →"}
          </span>
        </Link>
        <Link
          href={`/mapa?ano=${anoConfiabilidade}`}
          className="group block space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-acento/40"
        >
          <MapaConfiabilidade arquivo="/mapa/sp-leve.json" porAno={porAno} ano={anoConfiabilidade} compacto />
          <span className="block text-sm font-semibold text-acento-texto group-hover:underline">
            Comparar com a leitura de satélite →
          </span>
        </Link>
      </section>

      <BuscaMunicipio municipios={todos} valorInicial={q} />

      <div id="lista" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {q ? (
            <Link href="/#lista" className="text-sm font-semibold text-acento-texto hover:underline">
              ← ver os 645 por confiabilidade
            </Link>
          ) : (
            <p className="text-xs text-muted">Abra um nível para ver os municípios. A barra é a Interseção com o MapBiomas.</p>
          )}
          <SeletorAno anos={anosConfiabilidade} atual={anoConfiabilidade} termo={q} />
          <a
            href="/dados/municipios.csv"
            download
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:border-acento/40"
          >
            Baixar dados completos (CSV)
          </a>
        </div>

        <Suspense key={`${q ?? ""}|${nivelAberto ?? ""}|${anoConfiabilidade}`} fallback={<ListaSkeleton />}>
          <ListaMunicipios termo={q} nivelAberto={nivelAberto} ano={anoConfiabilidade} doAno={doAno} />
        </Suspense>
      </div>
    </div>
  );
}
