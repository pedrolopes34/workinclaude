import type { Metadata } from "next";
import Link from "next/link";
import { getMunicipioDetalhe, listarMunicipiosNoMapa, normalizarBusca } from "@/lib/queries";
import { formatKm2, formatPct, formatPValor, origemDasMetricas } from "@/lib/format";
import { Hero } from "@/components/Hero";
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

  const linhas: { rotulo: string; valor: (d: MunicipioDetalhe) => React.ReactNode }[] = [
    { rotulo: "Código IBGE", valor: (d) => <span className="font-mono">{d.municipio.codigoIbge}</span> },
    { rotulo: "Mesorregião", valor: (d) => d.municipio.mesorregiao ?? "—" },
    { rotulo: "Área do município", valor: (d) => formatKm2(d.municipio.areaKm2) },
    {
      rotulo: "Dado disponível",
      valor: (d) => (d.validacoes[0] ? `validado pela pesquisa (${d.validacoes[0].ano})` : "só cálculo automático"),
    },
    {
      rotulo: "Confiabilidade",
      valor: (d) => (d.validacoes[0] ? <SeloConfiabilidade nivel={d.validacoes[0].confiabilidade} /> : "—"),
    },
    { rotulo: "Recall", valor: (d) => formatPct(d.validacoes[0]?.recallPct ?? null) },
    { rotulo: "Interseção", valor: (d) => formatPct(d.validacoes[0]?.interseccaoPct ?? null, 2) },
    { rotulo: "valor-p", valor: (d) => formatPValor(d.validacoes[0]?.pValor ?? null) },
    { rotulo: "Área MapBiomas", valor: (d) => formatKm2(d.validacoes[0]?.areaMapbiomasKm2 ?? null) },
  ];

  // Métricas do mesmo recorte da validação (ago/2024 da pesquisa) — nunca
  // misturadas com as automáticas de outro período (seção 6.51).
  const metricaValidada = (d: MunicipioDetalhe) =>
    d.validacoes[0] ? d.metricas.find((x) => x.ano === d.validacoes[0].ano) : undefined;
  linhas.push(
    {
      rotulo: "Período das métricas",
      valor: (d) => {
        const mt = metricaValidada(d);
        return mt ? origemDasMetricas(mt.ano, d.municipio.naAmostra).periodo : "—";
      },
    },
    { rotulo: "Focos de calor", valor: (d) => metricaValidada(d)?.numFocosCalor ?? "—" },
    { rotulo: "Agrupamentos", valor: (d) => metricaValidada(d)?.numAgrupamentos ?? "—" },
    { rotulo: "Área (agrupamento)", valor: (d) => formatKm2(metricaValidada(d)?.areaStDbscanKm2 ?? null) },
    { rotulo: "Área (leitura de satélite)", valor: (d) => formatKm2(metricaValidada(d)?.areaDnbrKm2 ?? null) }
  );

  return (
    <div className="space-y-6">
      <Hero
        eyebrow="Comparar"
        titulo="Municípios lado a lado"
        descricao="Escolha até quatro municípios para ver os indicadores juntos. A ordem é a da sua escolha: aqui não há ranking nem vencedor."
      />

      <form method="get" action="/comparar" className="flex flex-wrap items-end gap-2">
        {escolhidos.length > 0 && <input type="hidden" name="m" value={escolhidos.join(",")} />}
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted">
          Adicionar município (nome ou código IBGE)
          <input
            name="add"
            list="lista-comparar"
            autoComplete="off"
            disabled={escolhidos.length >= MAXIMO}
            placeholder={escolhidos.length >= MAXIMO ? "Máximo de 4 — remova um para trocar" : "ex.: Olímpia"}
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground disabled:opacity-60"
          />
        </label>
        <datalist id="lista-comparar">
          {todos.map((x) => (
            <option key={x.codigoIbge} value={x.nome} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={escolhidos.length >= MAXIMO}
          className="rounded-full bg-acento-botao px-4 py-2 text-[19px] font-bold text-white transition-colors hover:bg-acento-botao-hover disabled:opacity-50"
        >
          Adicionar
        </button>
      </form>

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
        Só entram números validados pela pesquisa (agosto de 2024). Municípios fora da amostra aparecem com
        &ldquo;—&rdquo; nesses campos: o cálculo automático deles ainda não passou pela conferência da
        pesquisa (
        <Link href="/como-produzimos#limitacoes" className="underline">
          limitações
        </Link>
        ). O link desta página reproduz a mesma comparação.
      </p>
    </div>
  );
}
