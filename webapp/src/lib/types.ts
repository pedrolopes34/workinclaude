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
}

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
