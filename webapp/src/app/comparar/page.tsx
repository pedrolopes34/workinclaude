import type { Metadata } from "next";
import Link from "next/link";
import { getMunicipioDetalhe, listarMunicipiosNoMapa, normalizarBusca } from "@/lib/queries";
import { formatKm2, formatPct, formatPValor, rotuloJanelaDnbr, rotuloOrigemValidacao } from "@/lib/format";
import { Hero } from "@/components/Hero";
import { BuscaMunicipio } from "@/components/BuscaMunicipio";
import { SeloConfiabilidade } from "@/components/SeloConfiabilidade";
import type { MunicipioDetalhe } from "@/lib/types";

export const metadata: Metadata = {
  title: "Comparar municípios — Painel de Queimadas SP",
  description: "Indicadores de até quatro municípios de São Paulo lado a lado, sem ranking.",
};

const MAXIMO = 4;

function hrefComparacao(codigos: string[]): string {
  return codigos.length ? `/comparar?m=${codigos.join(",")}` : "/comparar";
}

// Lado a lado, na ordem em que a pessoa escolheu — sem ordenar por nenhuma
// métrica, sem "vencedor" (especificação de evolução, seção 12;
// docs/DECISIONS.md seção 6.52). O link da página reproduz a comparação.
export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; add?: string }>;
}) {
  const { m, add } = await searchParams;
  const todos = await listarMunicipiosNoMapa();
  const porNome = new Map(todos.map((x) => [normalizarBusca(x.nome), x.codigoIbge]));

  const existentes = new Set(todos.map((x) => x.codigoIbge));
  const codigos = (m ?? "").split(",").filter((c) => existentes.has(c));
  const digitado = add?.trim() ?? "";
  const codigoAdicionado = digitado
    ? (digitado.match(/\b\d{7}\b/)?.[0] ?? porNome.get(normalizarBusca(digitado)))
    : undefined;
  const naoAchou = digitado !== "" && !(codigoAdicionado && existentes.has(codigoAdicionado));
  if (codigoAdicionado && !naoAchou) codigos.push(codigoAdicionado);
  const escolhidos = [...new Set(codigos)].slice(0, MAXIMO);

  const detalhes = (await Promise.all(escolhidos.map((c) => getMunicipioDetalhe(c)))).filter(
    (d): d is MunicipioDetalhe => d !== null
  );

  // Os 645 têm os mesmos indicadores desde a seção 6.55: a confiabilidade mais
  // recente (da pesquisa ou do cálculo automático, com a origem dita), os
  // focos e agrupamentos dos dois últimos anos e a leitura de satélite.
  const anoAtual = new Date().getFullYear();
  const doAno = (d: MunicipioDetalhe, ano: number) => d.metricas.find((x) => x.ano === ano);
  const ultima = (d: MunicipioDetalhe) => d.validacoes[0];
  const linhas: { rotulo: string; valor: (d: MunicipioDetalhe) => React.ReactNode }[] = [
    { rotulo: "Código IBGE", valor: (d) => <span className="tabular-nums">{d.municipio.codigoIbge}</span> },
    { rotulo: "Mesorregião", valor: (d) => d.municipio.mesorregiao ?? "—" },
    { rotulo: "Área do município", valor: (d) => formatKm2(d.municipio.areaKm2) },
    {
      rotulo: "Confiabilidade",
      valor: (d) =>
        ultima(d) ? (
          <span className="flex flex-col items-start gap-1">
            <SeloConfiabilidade nivel={ultima(d).confiabilidade} />
            <span className="text-[11px] text-faint">{rotuloOrigemValidacao(ultima(d).fonte, ultima(d).ano)}</span>
          </span>
        ) : (
          "—"
        ),
    },
    { rotulo: "Recall", valor: (d) => formatPct(ultima(d)?.recallPct ?? null) },
    { rotulo: "Interseção", valor: (d) => formatPct(ultima(d)?.interseccaoPct ?? null, 2) },
    { rotulo: "valor-p", valor: (d) => formatPValor(ultima(d)?.pValor ?? null) },
    { rotulo: "Área MapBiomas", valor: (d) => formatKm2(ultima(d)?.areaMapbiomasKm2 ?? null) },
    { rotulo: `Focos de calor ${anoAtual - 1}`, valor: (d) => doAno(d, anoAtual - 1)?.numFocosCalor ?? "—" },
    { rotulo: `Agrupamentos ${anoAtual - 1}`, valor: (d) => doAno(d, anoAtual - 1)?.numAgrupamentos ?? "—" },
    { rotulo: `Focos de calor ${anoAtual} (até agora)`, valor: (d) => doAno(d, anoAtual)?.numFocosCalor ?? "—" },
    { rotulo: `Agrupamentos ${anoAtual} (até agora)`, valor: (d) => doAno(d, anoAtual)?.numAgrupamentos ?? "—" },
    {
      rotulo: "Leitura de satélite (mês mais recente)",
      valor: (d) => {
        const m = d.metricas.find((x) => x.dnbrImagemUrl);
        return m ? (
          <span className="flex flex-col">
            {formatKm2(m.areaDnbrKm2)}
            <span className="text-[11px] text-faint">{rotuloJanelaDnbr([m.dnbrImagemUrl])}</span>
          </span>
        ) : (
          "—"
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <Hero
        eyebrow="Comparar"
        titulo="Municípios lado a lado"
        descricao="Escolha até quatro municípios para ver os indicadores juntos. A ordem é a da sua escolha: aqui não há ranking nem vencedor."
      />

      <BuscaMunicipio
        id="comparar"
        municipios={todos}
        acao="/comparar"
        nomeCampo="add"
        destino={hrefComparacao([...escolhidos, "{codigo}"])}
        camposOcultos={escolhidos.length > 0 ? { m: escolhidos.join(",") } : {}}
        rotulo="Adicionar município à comparação (nome ou código IBGE)"
        placeholder={escolhidos.length >= MAXIMO ? "Máximo de 4 — remova um para trocar" : "Adicionar município, ex.: Olímpia"}
        textoBotao="Adicionar"
        desabilitado={escolhidos.length >= MAXIMO}
      />

      {naoAchou && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground">
          Não achei &ldquo;{add}&rdquo;. Escolha um nome da lista ou digite o código IBGE de 7 dígitos.
        </p>
      )}

      {detalhes.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted">
          Nenhum município escolhido ainda. Comece por um nome acima, ou pelo botão &ldquo;Comparar com outro
          município&rdquo; na página de qualquer município.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left align-bottom">
                <th scope="col" className="w-40 px-4 py-3 text-xs font-medium text-muted">
                  Indicador
                </th>
                {detalhes.map((d) => (
                  <th key={d.municipio.codigoIbge} scope="col" className="px-4 py-3">
                    <Link
                      href={`/municipio/${d.municipio.codigoIbge}`}
                      className="font-semibold text-acento-texto hover:underline"
                    >
                      {d.municipio.nome}
                    </Link>
                    <Link
                      href={hrefComparacao(escolhidos.filter((c) => c !== d.municipio.codigoIbge))}
                      className="block text-[11px] font-normal text-faint hover:underline"
                    >
                      remover
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.rotulo} className="border-t border-border">
                  <th scope="row" className="px-4 py-2.5 text-left text-xs font-medium text-muted">
                    {linha.rotulo}
                  </th>
                  {detalhes.map((d) => (
                    <td key={d.municipio.codigoIbge} className="px-4 py-2.5 text-foreground">
                      {linha.valor(d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        A confiabilidade é a do ano mais recente comparado ao MapBiomas; embaixo do selo, de onde ela vem (
        <Link href="/como-produzimos#confiabilidade" className="underline">
          como é calculada
        </Link>
        ). O link desta página reproduz a mesma comparação.
      </p>
    </div>
  );
}
