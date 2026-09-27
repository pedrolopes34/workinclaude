import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { FONTE_MALHA, MapaSPComCamadaNaUrl, type MunicipioMapa } from "@/components/MapaSP";
import { listarMunicipiosNoMapa } from "@/lib/queries";
import { rotuloJanelaDnbr } from "@/lib/format";

export const metadata: Metadata = {
  title: "Mapa de São Paulo — Painel de Queimadas SP",
  description:
    "Os 645 municípios de São Paulo no mapa: focos de calor, mudança na vegetação vista por satélite e a confiabilidade validada pela pesquisa.",
};

// Dado muda no máximo uma vez por dia (pipeline) — revalida de hora em hora
// em vez de consultar o banco a cada visita (especificação, seção 16).
export const revalidate = 3600;

export default async function MapaPage() {
  const municipios = await listarMunicipiosNoMapa();
  const anoAtual = new Date().getFullYear();
  const anos = { anterior: anoAtual - 1, atual: anoAtual };
  const rotuloVegetacao = rotuloJanelaDnbr(municipios.map((m) => m.dnbrImagemUrl));
  const dados: MunicipioMapa[] = municipios.map((m) => ({
    codigoIbge: m.codigoIbge,
    nome: m.nome,
    confiabilidade: m.confiabilidade,
    focosAnoAnterior: m.focosAnoAnterior,
    focosAnoAtual: m.focosAnoAtual,
    areaDnbrKm2: m.areaDnbrKm2 === null ? null : Number(m.areaDnbrKm2),
  }));
  const validados = municipios.filter((m) => m.confiabilidade).length;

  return (
    <div className="space-y-6">
      <Hero
        eyebrow="Mapa · São Paulo"
        titulo="Os 645 municípios, de uma vez"
        descricao="Focos de calor, mudança na vegetação vista por satélite e a confiabilidade validada pela pesquisa. Troque a camada, passe o mouse para ver o valor e clique num município para abrir a página dele."
      />

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <Suspense
          fallback={<div className="w-full animate-pulse rounded-xl bg-background" style={{ aspectRatio: "1000 / 740" }} />}
        >
          <MapaSPComCamadaNaUrl
            arquivo="/mapa/sp.json"
            municipios={dados}
            anos={anos}
            rotuloVegetacao={rotuloVegetacao}
          />
        </Suspense>
        <p className="mt-3 text-[11px] text-faint">{FONTE_MALHA}. As faixas são fixas: não mudam de um ano para o outro.</p>
      </section>

      <section className="space-y-3 text-sm text-muted">
        <h2 className="text-sm font-medium text-foreground">O que cada camada mostra</h2>
        <dl className="space-y-2.5">
          <div>
            <dt className="font-semibold text-foreground">Focos de calor</dt>
            <dd>
              Pontos quentes detectados pelo satélite de referência do INPE, o mesmo da pesquisa, somados no ano
              ({anos.anterior} completo; {anos.atual} até agora). Foco de calor não é incêndio confirmado, e zero
              focos não prova que não houve fogo.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Mudança na vegetação</dt>
            <dd>
              Parte do município em que o satélite Sentinel-2 viu mudança compatível com queima (dNBR de pelo menos
              0,10) entre {rotuloVegetacao}. <strong className="text-foreground">Não é área queimada</strong>: colheita
              e outras mudanças no campo entram nessa conta, e na validação visual da pesquisa boa parte dos pontos
              era atividade agrícola.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Confiabilidade (pesquisa)</dt>
            <dd>
              O quanto dá para confiar no resultado do método, onde a pesquisa comparou com o MapBiomas Fogo e
              conferiu à mão: os {validados} municípios da amostra (agosto de 2024). Os outros aparecem em cinza até
              serem validados. A cor não diz se queimou mais ou menos, e não é ranking.
            </dd>
          </div>
        </dl>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/#busca" className="font-semibold text-acento-texto hover:underline">
            Buscar um município
          </Link>
          <Link href="/como-produzimos#parametros" className="font-semibold text-acento-texto hover:underline">
            Como os números são feitos
          </Link>
          <Link href="/comparar" className="font-semibold text-acento-texto hover:underline">
            Comparar municípios
          </Link>
        </p>
      </section>
    </div>
  );
}
