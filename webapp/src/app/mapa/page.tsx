import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { FONTE_MALHA, LegendaMapa, MapaSP } from "@/components/MapaSP";
import { contarPorConfiabilidade, listarMunicipiosNoMapa } from "@/lib/queries";
import type { Confiabilidade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Mapa de São Paulo — Painel de Queimadas SP",
  description:
    "Os 645 municípios de São Paulo no mapa, com a confiabilidade validada pela pesquisa em cada um dos 63 municípios da amostra.",
};

// Dado muda no máximo uma vez por dia (pipeline) — revalida de hora em hora
// em vez de consultar o banco a cada visita (especificação, seção 16).
export const revalidate = 3600;

export default async function MapaPage() {
  const [municipios, contagem] = await Promise.all([listarMunicipiosNoMapa(), contarPorConfiabilidade()]);
  const semValidacao = municipios.filter((m) => !m.confiabilidade).length;
  const validados = municipios.length - semValidacao;
  const categorias: Record<string, Confiabilidade> = Object.fromEntries(
    municipios.filter((m) => m.confiabilidade).map((m) => [m.codigoIbge, m.confiabilidade as Confiabilidade])
  );
  const nomes = Object.fromEntries(municipios.map((m) => [m.codigoIbge, m.nome]));

  return (
    <div className="space-y-6">
      <Hero
        eyebrow="Mapa · São Paulo"
        titulo="Os 645 municípios, de uma vez"
        descricao="Cada cor é a confiabilidade validada pela pesquisa (agosto de 2024) nos municípios da amostra. Clique num município para abrir a página dele."
      />

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <LegendaMapa contagem={{ ...contagem, semValidacao }} />
        <MapaSP
          arquivo="/mapa/sp.json"
          categorias={categorias}
          nomes={nomes}
          descricao={`Mapa dos 645 municípios de São Paulo: ${validados} validados pela pesquisa (Alta ${contagem.Alta}, Média ${contagem.Média}, Baixa ${contagem.Baixa}, Insuficiente ${contagem.Insuficiente}) e ${semValidacao} ainda sem validação. A mesma informação está na busca da página inicial.`}
        />
        <p className="text-[11px] text-faint">
          {FONTE_MALHA}. Passe o mouse num município para ver o nome; clique (ou toque) para abrir a página dele.
        </p>
      </section>

      <section className="space-y-2 text-sm text-muted">
        <p>
          <strong className="text-foreground">Por que a maioria está em cinza?</strong> A confiabilidade só é
          exibida onde a pesquisa comparou o resultado com o MapBiomas Fogo e conferiu à mão: os {validados}{" "}
          municípios da amostra. Os outros continuam com página própria (mapa de leitura de satélite e consulta
          por mês), mas sem selo até serem validados.
        </p>
        <p>
          <strong className="text-foreground">O que a cor não diz:</strong> a confiabilidade mede o quanto dá para
          confiar no resultado do método naquele município, não se queimou mais ou menos lá. Não é um ranking.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/#busca" className="font-semibold text-acento-texto hover:underline">
            Buscar um município
          </Link>
          <Link href="/como-produzimos#confiabilidade" className="font-semibold text-acento-texto hover:underline">
            Como a confiabilidade é calculada
          </Link>
          <Link href="/comparar" className="font-semibold text-acento-texto hover:underline">
            Comparar municípios
          </Link>
        </p>
      </section>
    </div>
  );
}
