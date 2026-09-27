import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { MapaSPComCamadaNaUrl, type MunicipioMapa } from "@/components/MapaSP";
import { PainelMapas } from "@/components/mapas/PainelMapas";
import { chaveMes } from "@/lib/meses";
import { listarConfiabilidadePorAno, listarMosaicos, listarMunicipiosNoMapa } from "@/lib/queries";
import { agruparConfiabilidade } from "@/lib/mapas";

export const metadata: Metadata = {
  title: "Mapa de São Paulo — Painel de Queimadas SP",
  description:
    "Os 645 municípios de São Paulo: leitura de satélite (dNBR) do estado mês a mês, confiabilidade ano a ano e focos de calor.",
};

// Dado muda no máximo uma vez por dia (pipeline) — revalida de hora em hora
// em vez de consultar o banco a cada visita (especificação, seção 16).
export const revalidate = 3600;

export default async function MapaPage() {
  const [municipios, confiabilidades, mosaicos] = await Promise.all([
    listarMunicipiosNoMapa(),
    listarConfiabilidadePorAno(),
    listarMosaicos(),
  ]);
  const anoAtual = new Date().getFullYear();
  const anos = { anterior: anoAtual - 1, atual: anoAtual };
  const nomes = Object.fromEntries(municipios.map((m) => [m.codigoIbge, m.nome]));
  const porAno = agruparConfiabilidade(confiabilidades);
  const ultimoMosaico = mosaicos[mosaicos.length - 1];
  const focos: MunicipioMapa[] = municipios.map((m) => ({
    codigoIbge: m.codigoIbge,
    nome: m.nome,
    focosAnoAnterior: m.focosAnoAnterior,
    focosAnoAtual: m.focosAnoAtual,
  }));

  return (
    <div className="space-y-6">
      <Hero
        eyebrow="Mapa · São Paulo"
        titulo="O estado inteiro, mês a mês"
        descricao="À esquerda, a leitura de satélite de todo o estado; à direita, a confiabilidade de cada município. Troque o mês e o ano, ligue ou desligue os limites dos municípios, passe o mouse para ver o nome e clique para abrir a página do município."
      />

      <Suspense
        fallback={<div className="w-full animate-pulse rounded-2xl bg-surface" style={{ aspectRatio: "2000 / 740" }} />}
      >
        <PainelMapas
          mosaicos={mosaicos}
          porAno={porAno}
          nomes={nomes}
          mesPadrao={ultimoMosaico ? chaveMes(ultimoMosaico) : null}
        />
      </Suspense>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <Suspense
          fallback={<div className="w-full animate-pulse rounded-xl bg-background" style={{ aspectRatio: "1000 / 740" }} />}
        >
          <MapaSPComCamadaNaUrl arquivo="/mapa/sp.json" municipios={focos} anos={anos} />
        </Suspense>
        <p className="mt-3 text-[11px] text-faint">As faixas são fixas: não mudam de um ano para o outro.</p>
      </section>

      <section className="space-y-3 text-sm text-muted">
        <h2 className="text-sm font-medium text-foreground">O que cada mapa mostra</h2>
        <dl className="space-y-2.5">
          <div>
            <dt className="font-semibold text-foreground">Leitura de satélite (dNBR)</dt>
            <dd>
              A diferença do índice de queima (NBR) do Sentinel-2 entre o mês anterior e o mês escolhido, no estado
              inteiro. Verde é sem sinal; do amarelo ao preto, mudança cada vez maior na vegetação. Mostra onde a
              vegetação mudou, e não só fogo: colheita também muda o sinal. Onde houve nuvem demais, o município
              fica sem cor.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Confiabilidade</dt>
            <dd>
              O quanto dá para confiar no resultado do método em cada município, comparando os agrupamentos de focos
              com o MapBiomas Fogo. Nos 63 municípios estudados na pesquisa, a nota de 2024 é a de agosto,
              conferida à mão; nos demais, o mesmo cálculo roda para o ano inteiro. A cor não diz se queimou mais ou
              menos, e não é ranking.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Focos de calor</dt>
            <dd>
              Pontos quentes detectados pelo satélite de referência do INPE, o mesmo da pesquisa, somados no ano (
              {anos.anterior} completo; {anos.atual} até agora). Foco de calor não é incêndio confirmado, e zero focos
              não prova que não houve fogo.
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
