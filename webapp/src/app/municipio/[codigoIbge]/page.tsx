import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMunicipioDetalhe } from "@/lib/queries";
import { formatKm2, formatPct, formatPValor, origemDasMetricas } from "@/lib/format";
import { InfoTile } from "@/components/InfoTile";
import { ConsultaSobDemanda } from "@/components/ConsultaSobDemanda";
import { ImagemComFallback } from "@/components/ImagemComFallback";
import { SeloConfiabilidade } from "@/components/SeloConfiabilidade";
import { CriteriosConfiabilidade } from "@/components/CriteriosConfiabilidade";
import type { MetricasAnuais } from "@/lib/types";

const PRIMEIRO_ANO_VALIDACAO = 2018; // período inicial de validação da pesquisa (docs/DECISIONS.md)

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
  const max = Math.max(1, ...valores.map((v) => paraNumero(v.valor)));

  return (
    <div className="space-y-2.5">
      {valores.map((v) => (
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
        São três medidas diferentes, e não se espera que coincidam. A confiabilidade não compara esses
        tamanhos: ela usa os dois critérios acima.
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
function MapaDnbrAtual({
  nomeMunicipio,
  codigoIbge,
  metricas,
}: {
  nomeMunicipio: string;
  codigoIbge: string;
  metricas: MetricasAnuais[];
}) {
  const maisRecente = metricas.find((m) => m.dnbrImagemUrl);
  const imagemUrl =
    maisRecente?.dnbrImagemUrl ??
    (codigoIbge === CODIGO_IBGE_COM_MAPA_REAL ? "/dnbr-pitangueiras.png" : null);
  const rotuloAno = maisRecente ? String(maisRecente.ano) : "ago/2024";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
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
            Mapa dNBR mais recente ({rotuloAno}) · Sentinel-2/ESA, processado no Google Earth Engine. A cor
            mostra mudança espectral, não a causa do fogo.
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
    : `${detalhe.municipio.nome} ainda não foi validado pela pesquisa — mapa de leitura de satélite e consulta por mês.`;

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
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const { codigoIbge } = await params;
  const { ano: anoConsulta, mes: mesConsulta } = await searchParams;
  const detalhe = await getMunicipioDetalhe(codigoIbge);

  if (!detalhe) notFound();

  const { municipio, metricas, validacoes } = detalhe;

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {municipio.nome} <span className="text-lg font-normal text-muted">· SP</span>
        </h1>
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

      <ConsultaSobDemanda codigoIbge={municipio.codigoIbge} anoInicial={anoConsulta} mesInicial={mesConsulta} />

      <MapaDnbrAtual
        nomeMunicipio={municipio.nome}
        codigoIbge={municipio.codigoIbge}
        metricas={metricas}
      />

      {!municipio.naAmostra ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted shadow-sm">
          Este município ainda não está na amostra validada pela pesquisa, por isso não tem selo de
          confiabilidade. O mapa acima e a consulta por mês funcionam normalmente (
          <Link href="/como-produzimos#limitacoes" className="underline">
            veja as limitações do cálculo automático
          </Link>
          ).
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted">
            Confiabilidade por ano
          </h2>

          <div className="flex flex-wrap gap-1.5">
            {Array.from(
              { length: new Date().getFullYear() - PRIMEIRO_ANO_VALIDACAO + 1 },
              (_, i) => PRIMEIRO_ANO_VALIDACAO + i
            ).map((ano) => {
              const validado = validacoes.some((v) => v.ano === ano);
              return (
                <div
                  key={ano}
                  className={`flex w-12 flex-col items-center gap-1 rounded-lg border px-1 py-1.5 ${
                    validado ? "border-acento/50 bg-acento/10" : "border-border bg-surface"
                  }`}
                  title={validado ? `${ano}: validado pela pesquisa` : `${ano}: sem validação ainda`}
                >
                  <span className={`tabular-nums text-xs font-semibold ${validado ? "text-foreground" : "text-faint"}`}>
                    &apos;{String(ano).slice(2)}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${validado ? "bg-acento" : "bg-stone-300"}`} />
                </div>
              );
            })}
          </div>

          {validacoes.length === 0 ? (
            <p className="text-sm text-muted">
              Município na amostra, mas sem comparação registrada ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {validacoes.map((v) => {
                const metricasDoAno = metricas.find((m) => m.ano === v.ano);
                return (
                <div
                  key={v.ano}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <span className="text-sm text-muted">{v.ano}</span>
                      <p className="text-[11px] text-faint">
                        Validado pela pesquisa · comparado ao MapBiomas Fogo {v.mapbiomasColecao}
                      </p>
                    </div>
                    <SeloConfiabilidade nivel={v.confiabilidade} />
                  </div>

                  <CriteriosConfiabilidade
                    confiabilidade={v.confiabilidade}
                    recallPct={v.recallPct}
                    pValor={v.pValor}
                  />

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <InfoTile
                      rotulo="Recall"
                      valor={formatPct(v.recallPct)}
                      explicacao="Recall = área em comum entre os agrupamentos de focos e o MapBiomas ÷ área queimada do MapBiomas. Diz quanto da queima registrada pelo MapBiomas o método também pegou. Não é uma porcentagem de acerto: o método pode pegar tudo e ainda marcar área que não queimou."
                    />
                    <InfoTile
                      rotulo="Interseção"
                      valor={formatPct(v.interseccaoPct, 2)}
                      explicacao="Interseção sobre união (índice de Jaccard) entre a área dos agrupamentos e a área queimada do MapBiomas: área em comum ÷ área coberta por pelo menos um dos dois. Fica baixa sempre que um dos dois é bem maior que o outro, mesmo com Recall alto."
                    />
                    <InfoTile
                      rotulo="valor-p"
                      valor={formatPValor(v.pValor)}
                      explicacao={`Teste de permutação: a coincidência real entre agrupamentos e MapBiomas é comparada com ${v.nPermutacoes} posições sorteadas ao acaso, e o valor-p é a fração de sorteios que coincidiram tanto quanto ou mais que a real. Abaixo de 0,05, a coincidência dificilmente é acaso. Não mede a qualidade do método: só diz se a coincidência é maior que a esperada ao acaso.`}
                    />
                    <InfoTile
                      rotulo="Área MapBiomas"
                      valor={formatKm2(v.areaMapbiomasKm2)}
                      explicacao={`Área mapeada como queimada pelo MapBiomas Fogo (${v.mapbiomasColecao}) dentro do município, em km², no mesmo recorte de tempo da comparação. É a referência independente usada nos dois critérios.`}
                    />
                  </div>

                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium text-muted">
                      Três áreas do mesmo recorte · {v.ano}
                    </p>
                    <BarraComparacao
                      metodoKm2={metricasDoAno?.areaStDbscanKm2 ?? null}
                      satelliteKm2={metricasDoAno?.areaDnbrKm2 ?? null}
                      mapbiomasKm2={v.areaMapbiomasKm2}
                    />
                  </div>

                  {v.validacaoTemporal && (
                    <p className="mt-4 text-xs text-muted">
                      {v.validacaoTemporal}
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          )}

          <h2 className="pt-2 text-sm font-medium text-muted">
            Focos de calor e agrupamentos
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Período</th>
                  <th className="px-4 py-3 font-medium">Focos de calor</th>
                  <th className="px-4 py-3 font-medium">Agrupamentos</th>
                  <th className="px-4 py-3 font-medium">Área (agrupamento)</th>
                  <th className="px-4 py-3 font-medium">Área (leitura de satélite)</th>
                </tr>
              </thead>
              <tbody>
                {metricas.map((m) => {
                  const { periodo, origem } = origemDasMetricas(m.ano, municipio.naAmostra);
                  return (
                    <tr key={m.ano} className="border-t border-border">
                      <td className="px-4 py-3">
                        <span className="tabular-nums">{periodo}</span>
                        <span className="block text-[11px] text-faint">{origem}</span>
                      </td>
                      <td className="px-4 py-3">{m.numFocosCalor ?? "—"}</td>
                      <td className="px-4 py-3">{m.numAgrupamentos ?? "—"}</td>
                      <td className="px-4 py-3">{formatKm2(m.areaStDbscanKm2)}</td>
                      <td className="px-4 py-3">{formatKm2(m.areaDnbrKm2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            As linhas cobrem períodos diferentes: a da pesquisa é só agosto de 2024; as automáticas cobrem o ano
            inteiro (ou até agora, no ano corrente). Todas usam o satélite de referência do INPE (
            <Link href="/como-produzimos#limitacoes" className="underline">
              detalhes
            </Link>
            ).
          </p>

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
                  {metricas.map((m) => (
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
                  Validação {v.ano}: fonte <span className="tabular-nums">{v.fonte}</span> · MapBiomas Fogo{" "}
                  {v.mapbiomasColecao} · {v.nPermutacoes} permutações · critério fixo Recall ≥ 50% e valor-p &lt; 0,05.
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
        </section>
      )}
    </div>
  );
}
