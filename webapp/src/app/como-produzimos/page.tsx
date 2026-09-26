import type { Metadata } from "next";
import { CONFIABILIDADE_STYLE } from "@/lib/format";
import { Hero } from "@/components/Hero";

export const metadata: Metadata = {
  title: "Como produzimos — Painel de Queimadas SP",
  description:
    "A metodologia por trás do Painel de Queimadas SP: agrupamento de focos de calor, leitura de satélite (dNBR), comparação com o MapBiomas Fogo e como a confiabilidade de cada resultado é calculada.",
};

const PASSOS = [
  {
    titulo: "Onde os focos se agrupam",
    texto:
      "O INPE publica, todos os dias, os pontos onde satélites detectam calor compatível com fogo. Quando vários desses pontos aparecem próximos no espaço e no tempo, entendemos que fazem parte do mesmo evento de queima — e os agrupamos.",
  },
  {
    titulo: "Onde a vegetação mudou",
    texto:
      "Comparamos duas imagens de satélite (Sentinel-2) da mesma área, antes e depois do período analisado. Onde a vegetação queimou, essa mudança aparece de forma bem clara na imagem — é a nossa leitura de satélite (dNBR).",
  },
  {
    titulo: "Comparando com uma terceira fonte",
    texto:
      "Cruzamos os dois sinais com o MapBiomas Fogo, um mapeamento independente feito por outro grupo de pesquisa. Essa comparação é a base da nota de confiabilidade de cada resultado.",
  },
];

const NIVEIS: { nivel: "Alta" | "Média" | "Baixa" | "Insuficiente"; texto: string }[] = [
  {
    nivel: "Alta",
    texto:
      "Os dois critérios bateram: pelo menos metade da área queimada (segundo o MapBiomas) foi capturada pelo método, e a coincidência espacial foi maior do que o esperado pelo acaso.",
  },
  {
    nivel: "Média",
    texto:
      "Só um dos dois critérios bateu — geralmente a área capturada é boa, mas a coincidência espacial exata ainda não é estatisticamente forte (ou o contrário).",
  },
  {
    nivel: "Baixa",
    texto: "Nenhum dos dois critérios bateu nesse período. O resultado existe, mas merece mais cautela antes de ser usado sozinho.",
  },
  {
    nivel: "Insuficiente",
    texto:
      "Não houve agrupamento de focos suficiente nesse ano pra formar um resultado — não é um resultado ruim, é a ausência de um resultado.",
  },
];

const ATUALIZACOES = [
  { fonte: "Focos de calor (INPE)", cadencia: "Automático, todos os dias." },
  { fonte: "Leitura de satélite (dNBR)", cadencia: "Automático, uma vez por mês, em lotes de municípios." },
  { fonte: "Comparação com o MapBiomas", cadencia: "Verificação automática mensal por novas coleções." },
  { fonte: "Auditoria geral", cadencia: "Uma vez por ano, feita manualmente pela equipe de pesquisa." },
];

export default function ComoProduzimosPage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="Como produzimos · metodologia"
        titulo="De onde vêm esses números"
        descricao="Cruzamos duas fontes independentes de dado por satélite pra estimar onde o fogo passou — e avisamos, com clareza, o quanto dá pra confiar em cada resultado."
      />

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">O método, em três passos</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PASSOS.map((passo, i) => (
            <div key={passo.titulo} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-acento-botao font-mono text-xs font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{passo.titulo}</h3>
              <p className="mt-2 text-sm text-muted">{passo.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">A nota de confiabilidade</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {NIVEIS.map(({ nivel, texto }) => (
            <div key={nivel} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[19px] font-bold ${CONFIABILIDADE_STYLE[nivel].bg} ${CONFIABILIDADE_STYLE[nivel].text}`}
              >
                {CONFIABILIDADE_STYLE[nivel].label}
              </span>
              <p className="mt-3 text-sm text-muted">{texto}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-faint">
          Critério fixo: Recall ≥ 50% <strong>ou</strong> p &lt; 0,05 conta como &ldquo;passou&rdquo;.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Limitações que assumimos</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            O MapBiomas Fogo é um <strong className="text-foreground">ponto de comparação</strong>{" "}
            independente, não uma verdade absoluta — ele também tem sua própria margem de erro.
          </li>
          <li>
            Em municípios com pouca área queimada, o Recall pode variar bastante com poucos
            pixels de diferença — por isso ele nunca decide sozinho.
          </li>
          <li>
            A interseção entre os métodos pode parecer baixa mesmo quando o Recall é alto: são
            medidas diferentes, e mostramos as duas por transparência.
          </li>
          <li>
            O sistema testou o período de 2018 a 2024 como validação inicial, mas continua
            incorporando dados novos a partir daí.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">Como os dados se atualizam</h2>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {ATUALIZACOES.map((item) => (
            <div key={item.fonte} className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-acento" />
              <div>
                <p className="text-sm font-semibold text-foreground">{item.fonte}</p>
                <p className="text-sm text-muted">{item.cadencia}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
