export type Confiabilidade = "Alta" | "Média" | "Baixa" | "Insuficiente";

// Confiabilidade mostrada = a do ano mais recente comparado ao MapBiomas
// (docs/DECISIONS.md seção 6.55): da pesquisa nos 63 da amostra, do cálculo
// automático nos demais. null = ainda sem linha em validacao_mapbiomas.
export interface MunicipioResumo {
  codigoIbge: string;
  nome: string;
  mesorregiao: string | null;
  naAmostra: boolean;
  confiabilidade: Confiabilidade | null;
  interseccaoPct: string | null;
  fonte: FonteValidacao | null;
  ano: number | null;
}

export interface Municipio {
  codigoIbge: string;
  nome: string;
  mesorregiao: string | null;
  areaKm2: string | null;
  bioma: string | null;
  naAmostra: boolean;
  grupoAmostra: string | null;
}

export interface MetricasAnuais {
  ano: number;
  numFocosCalor: number | null;
  numAgrupamentos: number | null;
  areaStDbscanKm2: string | null;
  areaDnbrKm2: string | null;
  dnbrImagemUrl: string | null;
  epsSpaceKm: string;
  epsTimeDays: string;
  minSamples: number;
}

export interface ValidacaoMapbiomas {
  ano: number;
  areaMapbiomasKm2: string | null;
  interseccaoPct: string | null;
  pValor: string | null;
  recallPct: string | null;
  complementoMbKm2: string | null;
  confiabilidade: Confiabilidade;
  validacaoTemporal: string | null;
  mapbiomasColecao: string;
  fonte: FonteValidacao;
  nPermutacoes: number;
}

// 'manual' = validado pela pesquisa (os 63 da amostra); 'automatico' =
// pipeline (docs/DECISIONS.md seção 6.29). Desde a seção 6.55 a interface
// mostra as duas, com a origem indicada.
export type FonteValidacao = "manual" | "automatico";

// Linha única por município (os 645) — usada no mapa, na busca e na
// comparação. Confiabilidade como em MunicipioResumo.
export interface MunicipioNoMapa {
  codigoIbge: string;
  nome: string;
  confiabilidade: Confiabilidade | null;
  interseccaoPct: string | null;
  anoConfiabilidade: number | null;
  fonteConfiabilidade: FonteValidacao | null;
  focosAnoAnterior: number | null;
  focosAnoAtual: number | null;
  areaDnbrKm2: string | null;
  dnbrImagemUrl: string | null;
}

// Uma comparação com o MapBiomas por município × ano, pro mapa de
// confiabilidade com seletor de ano (seção 6.55).
export interface ConfiabilidadeNoAno {
  codigoIbge: string;
  ano: number;
  confiabilidade: Confiabilidade;
  interseccaoPct: string | null;
  fonte: FonteValidacao;
}

export interface ResumoCobertura {
  total: number;
  naAmostra: number;
  comMapaDnbr: number;
  ultimaAtualizacao: Date | null;
}

export type ContagemConfiabilidade = Record<Confiabilidade, number>;

export interface MunicipioDetalhe {
  municipio: Municipio;
  metricas: MetricasAnuais[];
  validacoes: ValidacaoMapbiomas[];
}

// Consulta ad-hoc de 1 município x 1 mês, calculada sob demanda via GitHub
// Actions (docs/DECISIONS.md seção 6.43) — nunca faz parte de MetricasAnuais
// (que é o dado anual oficial/auditado). Sem confiabilidade/MapBiomas.
export type StatusConsulta = "pendente" | "processando" | "concluido" | "erro";

export interface ConsultaSobDemanda {
  id: number;
  status: StatusConsulta;
  numFocosCalor: number | null;
  numAgrupamentos: number | null;
  areaStDbscanKm2: string | null;
  areaDnbrKm2: string | null;
  dnbrImagemUrl: string | null;
  mensagemErro: string | null;
}

// Mosaico estadual da leitura de satélite de um mês (tabela mosaicos_dnbr,
// pipeline/run_dnbr_estado.py — docs/DECISIONS.md seção 6.55). Os limites são
// o retângulo que a imagem cobre, o mesmo do viewBox do mapa do site.
export interface MosaicoDnbr {
  ano: number;
  mes: number;
  imagemUrl: string;
  oeste: number;
  sul: number;
  leste: number;
  norte: number;
  colecao: string;
}
