import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMunicipioDetalhe } from "@/lib/queries";
import { MESES_LONGOS } from "@/lib/meses";
import {
  formatKm2,
  formatPct,
  formatPValor,
  origemDasMetricas,
  rotuloJanelaDnbr,
  rotuloOrigemValidacao,
} from "@/lib/format";
import { InfoTile } from "@/components/InfoTile";
import { ConsultaSobDemanda } from "@/components/ConsultaSobDemanda";
import { ImagemComFallback } from "@/components/ImagemComFallback";
import { SeloConfiabilidade } from "@/components/SeloConfiabilidade";
import { CriteriosConfiabilidade } from "@/components/CriteriosConfiabilidade";
import type { Confiabilidade, MetricasAnuais, ValidacaoMapbiomas } from "@/lib/types";

// Janela de anos da página (docs/DECISIONS.md seção 6.55): desde 2018, início
// do histórico da pesquisa, até o ano corrente. Cada ano é um link
// (`?periodo=AAAA`), então dá pra compartilhar a visão de um ano.
const PRIMEIRO_ANO = 2018;

// Ponto de cada ano na faixa: a cor do selo quando há confiabilidade; neutro
// quando só há focos/agrupamentos; vazio quando ainda não há nada.
const PONTO_CONFIABILIDADE: Record<Confiabilidade, string> = {
  Alta: "bg-verde",
  Média: "bg-verde-claro",
  Baixa: "bg-areia ring-1 ring-areia-borda",
  Insuficiente: "bg-transparent ring-1 ring-faint",
};

// Três áreas com definições diferentes lado a lado (docs/DECISIONS.md seção
// 6.38). Cores neutras de propósito: verde/mostarda/terracota são só dos
// selos de confiabilidade (CLAUDE.md) e aqui não medem confiabilidade
// nenhuma (seção 6.52). Cada barra diz o que mede, porque não se espera que
// as três sejam iguais.
function BarraComparacao({
  metodoKm2,
  satelliteKm2,
  mapbiomasKm2,
}: {
  metodoKm2: string | null;
  satelliteKm2: string | null;
  mapbiomasKm2: string | null;
}) {
  const paraNumero = (v: string | null) => (v === null ? 0 : Number(v));
  const valores = [
    {
      nome: "Agrupamentos",
      valor: metodoKm2,
      cor: "bg-acento",
      definicao: "área de influência dos focos agrupados (raio de 3 km)",
    },
    {
      nome: "Leitura de satélite",
      valor: satelliteKm2,
      cor: "bg-stone-500",
      definicao: "pixels com dNBR de pelo menos 0,10 (Sentinel-2)",
    },
    {
      nome: "MapBiomas Fogo",
      valor: mapbiomasKm2,
      cor: "bg-stone-300",
      definicao: "área mapeada como queimada pelo MapBiomas",
    },
  ];
  const presentes = valores.filter((v) => v.valor !== null && Number(v.valor) > 0);
  const max = Math.max(1, ...presentes.map((v) => paraNumero(v.valor)));

  return (
    <div className="space-y-2.5">
      {presentes.map((v) => (
        <div key={v.nome}>
          <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs text-muted">{v.nome}</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-full border border-border bg-background">
              <div
                className={`h-full rounded-full ${v.cor}`}
                style={{ width: `${(paraNumero(v.valor) / max) * 100}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-xs font-semibold text-foreground">
              {formatKm2(v.valor)}
            </span>
          </div>
          <p className="pl-[8.75rem] text-[11px] text-faint">{v.definicao}</p>
        </div>
      ))}
      <p className="text-[11px] text-faint">
        São medidas diferentes, e não se espera que coincidam. A confiabilidade não compara esses tamanhos:
        ela usa os dois critérios acima.
      </p>
    </div>
  );
}

// Fallback: imagem real da pesquisa original (Pitangueiras, ago/2024) —
// usada só se este município nunca tiver rodado no pipeline de dNBR
// (docs/DECISIONS.md seção 7/6.40). Na prática já não deveria disparar
// pra Pitangueiras (tem imagem real do pipeline desde a seção 6.44), mas
// não custa manter como rede de segurança.
const CODIGO_IBGE_COM_MAPA_REAL = "3539509"; // Pitangueiras

// Mapa dNBR mais recente — camada operacional (docs/DECISIONS.md seção
// 1.1/6.14): atualiza mensal/diariamente e sempre grava no ANO CORRENTE,
// nunca no ano de uma validação MapBiomas (retrospectiva, capada em
// 2024 — seção 6.22). Por isso busca a miniatura mais recente disponível
// em qualquer ano de metricas_anuais, em vez de exigir que bata com o ano
// de alguma validação — a busca antiga fazia isso e o mapa nunca aparecia
// pra ninguém (bug real reportado pelo Pedro, seção 6.45).
// O rótulo diz a janela exata (seção 6.57): "(2026)" só dava o ano, e o Pedro
// clicou em São Paulo no mapa do estado de março, viu aqui o mapa de agosto →
// setembro e achou que era o mesmo mês. Quem chega pelo mapa do estado com
// um mês (?ano=&mes=) é avisado de onde está a leitura daquele mês.
function MapaDnbrAtual({
  nomeMunicipio,
  codigoIbge,
  metricas,
  mesPedido,
}: {
  nomeMunicipio: string;
  codigoIbge: string;
  metricas: MetricasAnuais[];
  mesPedido: { ano: number; mes: number } | null;
}) {
  const maisRecente = metricas.find((m) => m.dnbrImagemUrl);
  const imagemUrl =
    maisRecente?.dnbrImagemUrl ??
    (codigoIbge === CODIGO_IBGE_COM_MAPA_REAL ? "/dnbr-pitangueiras.png" : null);
  const rotuloAno = maisRecente?.dnbrImagemUrl ? rotuloJanelaDnbr([maisRecente.dnbrImagemUrl]) : "ago/2024";
  const chaveMaisRecente = maisRecente?.dnbrImagemUrl?.match(/-(\d{4})-(\d{2})\.png$/);
  const outroMes =
    mesPedido &&
    !(chaveMaisRecente && Number(chaveMaisRecente[1]) === mesPedido.ano && Number(chaveMaisRecente[2]) === mesPedido.mes);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {outroMes && mesPedido && (
        <p className="border-b border-border bg-background px-3 py-2 text-xs text-foreground">
          Este é o mapa mais recente ({rotuloAno}). A leitura de satélite de {MESES_LONGOS[mesPedido.mes - 1]} de{" "}
          {mesPedido.ano}, o mês que você escolheu no mapa do estado, está em{" "}
          <a href="#consulta" className="font-semibold text-acento-texto underline">
            Consultar outro período
          </a>
          , mais abaixo.
        </p>
      )}
      {imagemUrl ? (
        <>
          <ImagemComFallback
            src={imagemUrl}
            alt={`Mapa de severidade de queimada (dNBR) de ${nomeMunicipio}, ${rotuloAno}: verde é dNBR de até 0,10 (sem sinal de queima), passando por amarelo, laranja e vermelho até preto, que é dNBR de 0,70 ou mais.`}
            className="h-auto w-full"
            mensagemFallback="Não foi possível carregar o mapa deste município agora — tente recarregar a página."
          />
          {maisRecente ? (
            // Mesma escala da imagem gerada pelo pipeline (VIS_PARAMS em
            // pipeline/dnbr/sentinel2.py: min 0,1, max 0,7, verde → preto).
            // A legenda antiga dizia "−0,25 a 0,75" e usava as cores dos
            // selos — não batia com a imagem (seção 6.52).
            <div className="space-y-1 px-3 py-2">
              <span
                className="block h-2 w-full max-w-64 rounded-full"
                style={{ background: "linear-gradient(to right, green, yellow, orange, red, black)" }}
                aria-hidden="true"
              />
              <div className="flex max-w-64 justify-between text-[11px] text-faint">
                <span>0,10 ou menos</span>
                <span>0,70 ou mais</span>
              </div>
              <p className="text-[11px] text-faint">
                dNBR (sem unidade): quanto mais alto, maior a mudança na vegetação entre antes e depois. Áreas
                com dNBR de pelo menos 0,10 entram na área de leitura de satélite.
              </p>
            </div>
          ) : (
            <p className="px-3 py-2 text-[11px] text-faint">Imagem da pesquisa original, com paleta própria.</p>
          )}
          <p className="border-t border-border px-3 py-2 text-xs text-muted">
            Leitura de satélite (dNBR) mais recente: {rotuloAno} · Sentinel-2/ESA, processado no Google Earth
            Engine. A cor mostra mudança espectral, não a causa do fogo.
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center text-xs text-muted">
          <span>Mapa dNBR ainda não disponível para este município</span>
          <span className="text-faint">aparece assim que o pipeline mensal processar este município</span>
        </div>
      )}
    </section>
  );
}

// O que se sabe de um ano (docs/DECISIONS.md seção 6.55): focos e
// agrupamentos, leitura de satélite e a comparação com o MapBiomas, cada um
// só quando existe — sem linha nem quadro zerado. Um ano por vez, porque os
// períodos variam (a pesquisa é agosto de 2024; o cálculo automático, o ano
// inteiro) e lado a lado pareceriam comparáveis.
function PainelDoAno({
  ano,
  nomeMunicipio,
  naAmostra,
  metricas,
  validacao,
}: {
  ano: number;
  nomeMunicipio: string;
  naAmostra: boolean;
  metricas: MetricasAnuais | null;
  validacao: ValidacaoMapbiomas | null;
}) {
  const focos = metricas?.numFocosCalor ?? null;
  const agrupamentos = metricas?.numAgrupamentos ?? 0;
  const areaAgrupamentos = metricas?.areaStDbscanKm2 ?? null;
  const areaDnbr = metricas?.areaDnbrKm2 && Number(metricas.areaDnbrKm2) > 0 ? metricas.areaDnbrKm2 : null;
  const { periodo } = origemDasMetricas(ano, naAmostra);

  if (focos === null && areaDnbr === null && !validacao) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-5 py-6 text-sm text-muted shadow-sm">
        <p className="text-xl font-bold tracking-tight text-foreground">{ano}</p>
        <p className="mt-1">
          Os números de {ano} de {nomeMunicipio} ainda estão sendo calculados. Dá para calcular um mês
          específico na consulta logo abaixo.
        </p>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm" aria-labelledby="titulo-ano">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="titulo-ano" className="text-xl font-bold tracking-tight text-foreground">
            {ano}
          </h3>
          {focos !== null && <p className="text-xs text-muted">Focos e agrupamentos: {periodo}</p>}
        </div>
        {validacao && <SeloConfiabilidade nivel={validacao.confiabilidade} />}
      </div>

      {(focos !== null || areaDnbr !== null) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {focos !== null && focos > 0 && (
            <InfoTile
              rotulo="Focos de calor"
              valor={focos.toLocaleString("pt-BR")}
              explicacao="Focos detectados pelo satélite de referência do INPE (Aqua, passagem da tarde) dentro do município, no período. É o mesmo satélite que a pesquisa usa."
            />
          )}
          {agrupamentos > 0 && (
            <InfoTile
              rotulo="Agrupamentos"
              valor={agrupamentos.toLocaleString("pt-BR")}
              explicacao="Grupos de focos próximos no espaço (até 3 km) e no tempo (até 1 dia): o sinal de uma queimada contínua, e não de focos soltos."
            />
          )}
          {agrupamentos > 0 && areaAgrupamentos !== null && Number(areaAgrupamentos) > 0 && (
            <InfoTile
              rotulo="Área dos agrupamentos"
              valor={formatKm2(areaAgrupamentos)}
              explicacao="Área de influência dos focos agrupados: um raio de 3 km em volta de cada foco, somado por agrupamento."
            />
          )}
          {areaDnbr !== null && (
            <InfoTile
              rotulo="Leitura de satélite"
              valor={formatKm2(areaDnbr)}
              explicacao={`Área com dNBR de pelo menos 0,10 (Sentinel-2) ${
                metricas?.dnbrImagemUrl ? `na janela ${rotuloJanelaDnbr([metricas.dnbrImagemUrl])}` : "no período"
              }: onde a vegetação mudou entre antes e depois. Inclui colheita e outras mudanças, não só fogo.`}
            />
          )}
        </div>
      )}

      {focos !== null && agrupamentos === 0 && (
        <p className="mt-3 text-sm text-muted">
          {focos === 0
            ? "Nenhum foco de calor do satélite de referência neste período."
            : `${focos} foco${focos === 1 ? "" : "s"} de calor, espalhados: nenhum agrupamento se formou.`}
        </p>
      )}

      {validacao && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted">
            Comparação com o MapBiomas Fogo ({validacao.mapbiomasColecao}) ·{" "}
            {rotuloOrigemValidacao(validacao.fonte, validacao.ano)}
          </p>

          <CriteriosConfiabilidade
            confiabilidade={validacao.confiabilidade}
            recallPct={validacao.recallPct}
            pValor={validacao.pValor}
          />

          {validacao.confiabilidade !== "Insuficiente" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InfoTile
                rotulo="Recall"
                valor={formatPct(validacao.recallPct)}
                explicacao="Recall = área em comum entre os agrupamentos de focos e o MapBiomas ÷ área queimada do MapBiomas. Diz quanto da queima registrada pelo MapBiomas o método também pegou. Não é uma porcentagem de acerto: o método pode pegar tudo e ainda marcar área que não queimou."
              />
              <InfoTile
                rotulo="Interseção"
                valor={formatPct(validacao.interseccaoPct, 2)}
                explicacao="Interseção sobre união (índice de Jaccard) entre a área dos agrupamentos e a área queimada do MapBiomas: área em comum ÷ área coberta por pelo menos um dos dois. Fica baixa sempre que um dos dois é bem maior que o outro, mesmo com Recall alto."
              />
              <InfoTile
                rotulo="valor-p"
                valor={formatPValor(validacao.pValor)}
                explicacao={`Teste de permutação: a coincidência real entre agrupamentos e MapBiomas é comparada com ${validacao.nPermutacoes} posições sorteadas ao acaso, e o valor-p é a fração de sorteios que coincidiram tanto quanto ou mais que a real. Abaixo de 0,05, a coincidência dificilmente é acaso.`}
              />
              <InfoTile
                rotulo="Área MapBiomas"
                valor={formatKm2(validacao.areaMapbiomasKm2)}
                explicacao={`Área mapeada como queimada pelo MapBiomas Fogo (${validacao.mapbiomasColecao}) dentro do município, no mesmo recorte de tempo da comparação. É a referência independente usada nos dois critérios.`}
              />
            </div>
          )}

          {validacao.confiabilidade !== "Insuficiente" && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted">Áreas do mesmo recorte · {ano}</p>
              <BarraComparacao
                metodoKm2={areaAgrupamentos}
                satelliteKm2={areaDnbr}
                mapbiomasKm2={validacao.areaMapbiomasKm2}
              />
            </div>
          )}

          {validacao.validacaoTemporal && <p className="text-xs text-muted">{validacao.validacaoTemporal}</p>}
        </div>
      )}
    </article>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoIbge: string }>;
}): Promise<Metadata> {
  const { codigoIbge } = await params;
  const detalhe = await getMunicipioDetalhe(codigoIbge);

  if (!detalhe) return { title: "Município não encontrado" };

  const ultimaValidacao = detalhe.validacoes[0];
  const descricao = ultimaValidacao
    ? `Confiabilidade ${ultimaValidacao.confiabilidade} (${ultimaValidacao.ano}) — agrupamento de focos de calor + leitura de satélite comparado ao MapBiomas Fogo.`
    : `${detalhe.municipio.nome}: focos de calor, agrupamentos e leitura de satélite, ano a ano, e consulta por mês.`;

  return {
    title: `${detalhe.municipio.nome} — Painel de Queimadas SP`,
    description: descricao,
  };
}

export default async function MunicipioPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigoIbge: string }>;
  searchParams: Promise<{ ano?: string; mes?: string; periodo?: string }>;
}) {
  const { codigoIbge } = await params;
  const { ano: anoConsulta, mes: mesConsulta, periodo } = await searchParams;
  const detalhe = await getMunicipioDetalhe(codigoIbge);

  if (!detalhe) notFound();

  const { municipio, metricas, validacoes } = detalhe;
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, i) => anoAtual - i);
  const ultimaValidacao = validacoes[0] ?? null;
  // Padrão: o ano mais recente com confiabilidade; sem nenhuma, o mais recente com dado.
  const anoPadrao = ultimaValidacao?.ano ?? metricas.find((m) => m.numFocosCalor !== null)?.ano ?? anoAtual;
  const anoSelecionado = anos.includes(Number(periodo)) ? Number(periodo) : anoPadrao;
  // O selo do cabeçalho é o do ano escolhido (seção 6.57, pedido do Pedro:
  // "mostrar a confiabilidade do ano escolhido, e não de 2024").
  const validacaoDoAno = validacoes.find((v) => v.ano === anoSelecionado) ?? null;

  // Mantém ?ano=&mes= da consulta por mês ao trocar o ano do painel.
  function hrefAno(ano: number): string {
    const busca = new URLSearchParams();
    if (anoConsulta) busca.set("ano", anoConsulta);
    if (mesConsulta) busca.set("mes", mesConsulta);
    busca.set("periodo", String(ano));
    return `?${busca.toString()}#ano`;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/#busca" className="text-[19px] font-bold text-acento hover:underline">
          ← voltar para a busca
        </Link>
        <Link
          href={`/comparar?m=${municipio.codigoIbge}`}
          className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground hover:border-acento/40"
        >
          Comparar com outro município
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {municipio.nome} <span className="text-lg font-normal text-muted">· SP</span>
          </h1>
          {validacaoDoAno ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Confiabilidade {anoSelecionado}</span>
              <SeloConfiabilidade nivel={validacaoDoAno.confiabilidade} />
            </div>
          ) : (
            ultimaValidacao && (
              <p className="max-w-xs text-right text-xs text-muted">
                Confiabilidade {anoSelecionado}: ainda sem comparação — o MapBiomas Fogo vai até{" "}
                {ultimaValidacao.ano}.
              </p>
            )
          )}
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <div>
            <dt className="inline">código IBGE </dt>
            <dd className="inline tabular-nums">{municipio.codigoIbge}</dd>
          </div>
          {municipio.mesorregiao && (
            <div>
              <dt className="inline">mesorregião </dt>
              <dd className="inline">{municipio.mesorregiao}</dd>
            </div>
          )}
          {municipio.areaKm2 && (
            <div>
              <dt className="inline">área </dt>
              <dd className="inline">{formatKm2(municipio.areaKm2)}</dd>
            </div>
          )}
          {municipio.bioma && (
            <div>
              <dt className="inline">bioma </dt>
              <dd className="inline">{municipio.bioma}</dd>
            </div>
          )}
        </dl>
      </header>

      <MapaDnbrAtual
        nomeMunicipio={municipio.nome}
        codigoIbge={municipio.codigoIbge}
        metricas={metricas}
        mesPedido={
          Number(anoConsulta) >= 2018 && Number(mesConsulta) >= 1 && Number(mesConsulta) <= 12
            ? { ano: Number(anoConsulta), mes: Number(mesConsulta) }
            : null
        }
      />

      <section id="ano" className="scroll-mt-24 space-y-4" aria-labelledby="titulo-ano-a-ano">
        <h2 id="titulo-ano-a-ano" className="text-sm font-medium text-muted">
          Ano a ano
        </h2>
        <nav aria-label="Escolher o ano" className="flex flex-wrap gap-1.5">
          {anos.map((ano) => {
            const v = validacoes.find((x) => x.ano === ano);
            const m = metricas.find((x) => x.ano === ano);
            const selecionado = ano === anoSelecionado;
            const descricao = v
              ? `confiabilidade ${v.confiabilidade}`
              : m
                ? "focos e agrupamentos"
                : "sem dados ainda";
            return (
              <Link
                key={ano}
                href={hrefAno(ano)}
                scroll={false}
                aria-current={selecionado ? "true" : undefined}
                title={`${ano}: ${descricao}`}
                className={`flex w-14 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors ${
                  selecionado
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-surface text-foreground hover:border-acento/50"
                }`}
              >
                <span className="tabular-nums text-sm font-semibold">{ano}</span>
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    v ? PONTO_CONFIABILIDADE[v.confiabilidade] : m ? "bg-faint" : "bg-transparent"
                  }`}
                />
                <span className="sr-only">{descricao}</span>
              </Link>
            );
          })}
        </nav>

        <PainelDoAno
          ano={anoSelecionado}
          nomeMunicipio={municipio.nome}
          naAmostra={municipio.naAmostra}
          metricas={metricas.find((m) => m.ano === anoSelecionado) ?? null}
          validacao={validacoes.find((v) => v.ano === anoSelecionado) ?? null}
        />
      </section>

      <ConsultaSobDemanda codigoIbge={municipio.codigoIbge} anoInicial={anoConsulta} mesInicial={mesConsulta} />

      <details className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-medium text-foreground">Detalhes técnicos</summary>
        <div className="mt-3 space-y-3 text-xs text-muted">
          <p>Parâmetros do agrupamento espaço-temporal (ST-DBSCAN) gravados para cada período:</p>
          <table className="w-full">
            <thead className="text-left">
              <tr>
                <th className="py-1 pr-3 font-medium">Período</th>
                <th className="py-1 pr-3 font-medium">Raio espacial</th>
                <th className="py-1 pr-3 font-medium">Janela de tempo</th>
                <th className="py-1 font-medium">Mínimo de focos</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {metricas
                .filter((m) => m.numFocosCalor !== null)
                .map((m) => (
                  <tr key={m.ano}>
                    <td className="py-1 pr-3">{origemDasMetricas(m.ano, municipio.naAmostra).periodo}</td>
                    <td className="py-1 pr-3">{Number(m.epsSpaceKm).toLocaleString("pt-BR")} km</td>
                    <td className="py-1 pr-3">{Number(m.epsTimeDays).toLocaleString("pt-BR")} dia(s)</td>
                    <td className="py-1">{m.minSamples}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {validacoes.map((v) => (
            <p key={v.ano}>
              Comparação {v.ano}: {rotuloOrigemValidacao(v.fonte, v.ano)} · MapBiomas Fogo {v.mapbiomasColecao} ·{" "}
              {v.nPermutacoes} permutações · critério fixo Recall ≥ 50% e valor-p &lt; 0,05.
            </p>
          ))}
          <p>
            Código IBGE <span className="tabular-nums">{municipio.codigoIbge}</span> ·{" "}
            <Link href="/como-produzimos#parametros" className="underline">
              metodologia completa
            </Link>
          </p>
        </div>
      </details>
    </div>
  );
}
