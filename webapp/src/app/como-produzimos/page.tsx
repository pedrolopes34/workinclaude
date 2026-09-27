import type { Metadata } from "next";
import Link from "next/link";
import { REGRA_CONFIABILIDADE } from "@/lib/format";
import { Hero } from "@/components/Hero";
import { SeloConfiabilidade } from "@/components/SeloConfiabilidade";
import type { Confiabilidade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Como produzimos — Painel de Queimadas SP",
  description:
    "A metodologia por trás do Painel de Queimadas SP: agrupamento de focos de calor, leitura de satélite (dNBR), comparação com o MapBiomas Fogo, parâmetros, limitações e fontes.",
};

// Cada passo diz o que entra, o que sai e com quais parâmetros
// (especificação de evolução, seções 13 e 14 — docs/DECISIONS.md seção 6.52).
// Os parâmetros são os do código (pipeline/stdbscan/core.py,
// pipeline/dnbr/sentinel2.py, pipeline/dnbr/constants.py).
const PASSOS = [
  {
    titulo: "Focos de calor",
    texto:
      "O INPE publica, todos os dias, os pontos onde satélites detectaram calor compatível com fogo. Usamos só os do satélite de referência, como a pesquisa. Um foco de calor não é um incêndio confirmado: é um ponto quente visto do espaço.",
  },
  {
    titulo: "Agrupamento de focos",
    texto:
      "Focos próximos no espaço e no tempo formam um agrupamento (algoritmo ST-DBSCAN). Um agrupamento pode corresponder a um ou mais episódios de queima: o método não afirma que seja um único incêndio.",
  },
  {
    titulo: "Leitura de satélite",
    texto:
      "Comparamos imagens Sentinel-2 de antes e depois do período. Onde a vegetação queimou, o índice NBR cai; a diferença (dNBR) mostra onde houve mudança compatível com queima.",
  },
  {
    titulo: "Comparação independente",
    texto:
      "Cruzamos os agrupamentos com o MapBiomas Fogo, um mapeamento de área queimada feito por outra equipe. Dois critérios dessa comparação definem a confiabilidade.",
  },
];

const PARAMETROS: { nome: string; valor: string }[] = [
  { nome: "Focos de calor", valor: "só os do satélite de referência do INPE (AQUA_M-T), como a pesquisa" },
  { nome: "Raio espacial do agrupamento", valor: "3 km" },
  { nome: "Janela de tempo do agrupamento", valor: "1 dia" },
  {
    nome: "Mínimo de focos por agrupamento",
    valor:
      "4 quando o período tem mais focos que o histórico do próprio município (caso da maioria em ago/2024); 2 nos demais. A consulta por mês usa sempre 4.",
  },
  { nome: "Área de influência", valor: "raio de 3 km em volta de cada foco agrupado, unido por agrupamento" },
  { nome: "Imagens", valor: "Sentinel-2 nível 2A harmonizado (COPERNICUS/S2_SR_HARMONIZED), mediana das cenas de cada janela" },
  { nome: "Índice", valor: "NBR = (B8 − B12) ÷ (B8 + B12); dNBR = NBR antes − NBR depois" },
  { nome: "Janela do cálculo automático", valor: "mês anterior × mês analisado" },
  {
    nome: "Nuvem",
    valor: "tenta cenas com menos de 20% de nuvem e relaxa até 80% se preciso pra cobrir pelo menos metade do município",
  },
  { nome: "Área de leitura de satélite", valor: "pixels com dNBR de pelo menos 0,10 (limiares de severidade: 0,10 · 0,27 · 0,44)" },
  { nome: "Referência de comparação", valor: "MapBiomas Fogo, Coleção 4 (anual; vai até 2024)" },
  { nome: "Teste de significância", valor: "teste de permutação com 999 sorteios" },
];

const NIVEIS: Confiabilidade[] = ["Alta", "Média", "Baixa", "Insuficiente"];

const ATUALIZACOES = [
  { fonte: "Focos de calor (INPE)", cadencia: "Automático, todos os dias." },
  { fonte: "Leitura de satélite (dNBR)", cadencia: "Automático, uma vez por mês, para os 645 municípios." },
  { fonte: "Comparação com o MapBiomas", cadencia: "Manual, quando sai uma coleção nova do MapBiomas Fogo (uma vez por ano)." },
  { fonte: "Auditoria geral", cadencia: "Uma vez por ano, feita manualmente pela equipe de pesquisa." },
];

const FONTES = [
  {
    nome: "INPE — Programa Queimadas (focos de calor)",
    href: "https://terrabrasilis.dpi.inpe.br/queimadas/portal/",
  },
  {
    nome: "Sentinel-2 (ESA/Copernicus), via Google Earth Engine",
    href: "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
  },
  { nome: "MapBiomas Fogo", href: "https://brasil.mapbiomas.org/" },
  { nome: "Malha municipal do IBGE (desenho do mapa, via geodata-br)", href: "https://github.com/tbrugz/geodata-br" },
];

const REFERENCIAS = [
  "BIRANT, D.; KUT, A. ST-DBSCAN: An algorithm for clustering spatial–temporal data. Data & Knowledge Engineering, v. 60, n. 1, p. 208–221, 2007.",
  "KEY, C. H.; BENSON, N. C. Landscape Assessment (LA): Sampling and Analysis Methods. USDA Forest Service, General Technical Report RMRS-GTR-164-CD, 2006.",
  "ALENCAR, A. A. C. et al. Long-Term Landsat-Based Monthly Burned Area Dataset for the Brazilian Biomes Using Deep Learning. Remote Sensing, v. 14, n. 11, 2510, 2022.",
];

export default function ComoProduzimosPage() {
  return (
    <div className="space-y-10">
      <Hero
        eyebrow="Como produzimos · metodologia"
        titulo="De onde vêm esses números"
        descricao="Cruzamos duas fontes independentes de dado por satélite pra estimar onde o fogo passou — e avisamos, com clareza, o quanto dá pra confiar em cada resultado."
      />

      <nav aria-label="Nesta página" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[
          ["#metodo", "Método"],
          ["#parametros", "Parâmetros"],
          ["#confiabilidade", "Confiabilidade"],
          ["#limitacoes", "Limitações"],
          ["#fontes", "Fontes e referências"],
          ["#atualizacao", "Atualização"],
        ].map(([href, rotulo]) => (
          <a key={href} href={href} className="font-semibold text-acento-texto hover:underline">
            {rotulo}
          </a>
        ))}
      </nav>

      <section id="metodo" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-medium text-muted">O método, passo a passo</h2>
        <div className="grid gap-4 sm:grid-cols-2">
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
        <p className="text-xs text-faint">
          Dado de origem → agrupamento → leitura de satélite → comparação → selo. O método é descrito aqui; a
          interpretação de cada resultado fica na página de cada município, junto das métricas.
        </p>
      </section>

      <section id="parametros" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-medium text-muted">Parâmetros usados</h2>
        <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm shadow-sm">
          {PARAMETROS.map((p) => (
            <div key={p.nome} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">{p.nome}</dt>
              <dd className="text-muted">{p.valor}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-faint">
          Os parâmetros gravados para cada município e período aparecem em &ldquo;Detalhes técnicos&rdquo;, na
          página do município.
        </p>
      </section>

      <section id="confiabilidade" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-medium text-muted">A nota de confiabilidade</h2>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted shadow-sm">
          <p>Dois critérios, sempre os mesmos:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Recall de pelo menos 50%</strong>: pelo menos metade da área
              queimada segundo o MapBiomas caiu dentro dos agrupamentos de focos.
            </li>
            <li>
              <strong className="text-foreground">valor-p abaixo de 0,05</strong>: a coincidência entre
              agrupamentos e MapBiomas é maior do que a esperada ao acaso.
            </li>
          </ol>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {NIVEIS.map((nivel) => (
            <div key={nivel} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <SeloConfiabilidade nivel={nivel} />
              <p className="mt-3 text-sm text-muted">{REGRA_CONFIABILIDADE[nivel]}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-faint">
          A nota diz o quanto dá para confiar no resultado do método naquele município e ano. Não diz se queimou
          mais ou menos, e não serve para ranquear municípios.
        </p>
      </section>

      <section id="limitacoes" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-medium text-muted">Limitações que assumimos</h2>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm shadow-sm">
          <p className="font-semibold text-foreground">Correção de 27/09/2026: o mesmo satélite da pesquisa</p>
          <p className="mt-2 text-muted">
            Até esse dia, o cálculo automático somava os focos de todos os satélites do INPE, e a pesquisa usa só o
            satélite de referência. Em Pitangueiras, em agosto de 2024, eram 1.588 focos contra 95. O cálculo
            automático passou a usar só o satélite de referência e foi refeito de 2024 a 2026. Conferindo nos 63
            municípios da pesquisa, os agrupamentos de agosto de 2024 agora batem em 62 deles.
          </p>
          <p className="mt-2 text-muted">
            O que ainda difere: a contagem de focos que o INPE publica hoje é um pouco maior que a da pesquisa (em
            apuração), e a validação automática compara o ano inteiro com o MapBiomas, enquanto a da pesquisa
            compara agosto. Por isso o selo de confiabilidade continua aparecendo só onde a pesquisa validou.
          </p>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            <strong className="text-foreground">Foco de calor não é incêndio confirmado</strong>, e um mesmo fogo
            pode gerar vários focos (vários satélites e várias passagens).
          </li>
          <li>
            <strong className="text-foreground">Agrupamento não é um incêndio único</strong>: pode juntar mais de
            um episódio de queima próximo no espaço e no tempo.
          </li>
          <li>
            <strong className="text-foreground">Ausência de foco não prova ausência de fogo</strong>: nuvem,
            horário da passagem do satélite e fogo pequeno ou rápido podem esconder a queima.
          </li>
          <li>
            Imagens ópticas (Sentinel-2) dependem de céu limpo. Com nuvem demais, a leitura de satélite fica sem
            valor para aquele período.
          </li>
          <li>
            As fontes têm resoluções diferentes: focos de calor de centenas de metros a quilômetros por pixel,
            Sentinel-2 de 10 a 20 m, MapBiomas Fogo de 30 m (Landsat).
          </li>
          <li>
            O dNBR mede mudança na vegetação entre duas datas, não a causa. Colheita e solo exposto também mudam
            o sinal: na validação visual da pesquisa, boa parte dos pontos marcados era atividade agrícola.
          </li>
          <li>
            O MapBiomas Fogo é um <strong className="text-foreground">ponto de comparação</strong> independente,
            não uma verdade absoluta: ele também tem margem de erro.
          </li>
          <li>
            As áreas comparadas (influência dos agrupamentos, leitura de satélite, MapBiomas) têm definições
            diferentes e não precisam coincidir. Em municípios com pouca área queimada, o Recall varia muito com
            poucos pixels de diferença, por isso ele nunca decide sozinho.
          </li>
          <li>O histórico de focos de 2018 a 2023 ainda não foi integrado.</li>
        </ul>
      </section>

      <section id="fontes" className="scroll-mt-24 space-y-4">
        <h2 className="text-sm font-medium text-muted">Fontes e referências</h2>
        <ul className="space-y-2 text-sm">
          {FONTES.map((f) => (
            <li key={f.href}>
              <a href={f.href} className="font-semibold text-acento-texto hover:underline" rel="noopener noreferrer">
                {f.nome}
              </a>
            </li>
          ))}
        </ul>
        <div className="space-y-2 text-xs text-muted">
          <p className="font-medium text-foreground">Referências dos métodos</p>
          <ul className="space-y-1.5">
            {REFERENCIAS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-faint">
            Os dados tabulares dos municípios validados podem ser baixados em CSV na{" "}
            <Link href="/#lista" className="underline">
              página inicial
            </Link>
            .
          </p>
        </div>
      </section>

      <section id="atualizacao" className="scroll-mt-24 space-y-4">
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
