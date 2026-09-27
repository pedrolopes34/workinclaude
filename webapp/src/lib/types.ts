export type Confiabilidade = "Alta" | "Média" | "Baixa" | "Insuficiente";

export interface MunicipioResumo {
  codigoIbge: string;
  nome: string;
  mesorregiao: string | null;
  naAmostra: boolean;
  confiabilidade: Confiabilidade | null; // null = fora da amostra, nunca comparado
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
// pipeline (docs/DECISIONS.md seção 6.29). A interface só exibe 'manual'
// por enquanto (seção 6.52).
export type FonteValidacao = "manual" | "automatico";

// Linha única por município (os 645), com a confiabilidade validada pela
// pesquisa quando existe — usada no mapa, na busca e na exportação.
export interface MunicipioNoMapa {
  codigoIbge: string;
  nome: string;
  confiabilidade: Confiabilidade | null;
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
