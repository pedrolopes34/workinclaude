-- Painel de Queimadas SP — schema do banco (Postgres + PostGIS)
--
-- 5 tabelas + 1 view, conforme docs/DECISIONS.md secao 3. Decisoes de
-- coluna que nao estavam explicitas em docs/DECISIONS.md no momento da
-- implementacao (valores do enum de status_processamento, SRID de geom,
-- logica de fallback da view ano_ativo) estao comentadas inline e
-- registradas em docs/DECISIONS.md secao 7 — sao suposicoes de
-- implementacao, nao decisoes fechadas com o Pedro.

CREATE EXTENSION IF NOT EXISTS postgis;

-- =========================================================================
-- 1. municipios (dimensao)
-- =========================================================================
CREATE TABLE municipios (
    codigo_ibge     CHAR(7) PRIMARY KEY,
    nome            TEXT NOT NULL,
    mesorregiao     TEXT,
    area_km2        NUMERIC(10, 2),
    bioma           TEXT,
    na_amostra      BOOLEAN NOT NULL DEFAULT false,
    grupo_amostra   TEXT CHECK (grupo_amostra IN ('30 originais', '33 novos')),
    -- SIRGAS2000 (SRID 4674) e o sistema de referencia oficial do IBGE.
    -- Fica NULL ate a malha municipal (SP_Municipios_2024) ser importada
    -- em /geodata — ver docs/DECISIONS.md secao 3, ponto 2.
    geom            geometry(MultiPolygon, 4674),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_municipios_na_amostra ON municipios (na_amostra) WHERE na_amostra;
CREATE INDEX idx_municipios_geom ON municipios USING GIST (geom);

COMMENT ON TABLE municipios IS 'Dimensao: os 645 municipios de SP. na_amostra=true marca os que ja entraram em alguma rodada de validacao.';
COMMENT ON COLUMN municipios.grupo_amostra IS 'Rotulo da Tabela_Final_63_Municipios.xlsx: 30 municipios das rodadas 1-5+complemento, ou 33 novos da Fase 4/Cerrado+Rodada 6. NULL fora da amostra.';

-- =========================================================================
-- 2. metricas_anuais (municipio x ano — camada operacional ST-DBSCAN/dNBR)
-- =========================================================================
CREATE TABLE metricas_anuais (
    id                  BIGSERIAL PRIMARY KEY,
    codigo_ibge         CHAR(7) NOT NULL REFERENCES municipios (codigo_ibge),
    ano                 SMALLINT NOT NULL,
    num_focos_calor     INT,
    num_agrupamentos    INT,
    area_st_dbscan_km2  NUMERIC(10, 2),
    area_dnbr_km2       NUMERIC(10, 2),
    -- Parametros do ST-DBSCAN usados nesta rodada (rastreabilidade — ver
    -- CONTEXTO_PROJETO.md). Guardados por linha, nao fixos globalmente,
    -- porque cidades de sinal fraco usaram min_samples=2 como teste de
    -- limite do metodo.
    eps_space_km        NUMERIC(4, 2) NOT NULL DEFAULT 3.0,
    eps_time_days       NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    min_samples         SMALLINT NOT NULL DEFAULT 4,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (codigo_ibge, ano)
);

CREATE INDEX idx_metricas_anuais_codigo_ibge ON metricas_anuais (codigo_ibge);

COMMENT ON TABLE metricas_anuais IS 'Fato: resultado do metodo proprio (focos + agrupamentos + areas) por municipio e ano. Independe de ter sido comparado ao MapBiomas.';

-- =========================================================================
-- 3. validacao_mapbiomas (so onde ja comparado ao MapBiomas Fogo)
-- =========================================================================
CREATE TABLE validacao_mapbiomas (
    id                      BIGSERIAL PRIMARY KEY,
    codigo_ibge             CHAR(7) NOT NULL REFERENCES municipios (codigo_ibge),
    ano                     SMALLINT NOT NULL,
    area_mapbiomas_km2      NUMERIC(10, 2),
    -- IoU/Jaccard em percentual — terminologia publica e "Interseção"
    -- (nunca "IoU"), ver CLAUDE.md.
    interseccao_pct         NUMERIC(6, 2),
    p_valor                 NUMERIC(5, 3),
    n_permutacoes           INT NOT NULL DEFAULT 999,
    recall_pct              NUMERIC(5, 2),
    -- "Complemento ao MapBiomas": area que o metodo proprio achou e o
    -- MapBiomas nao tem. Nao e erro — e onde os dois metodos discordam.
    complemento_mb_km2      NUMERIC(10, 2),
    confiabilidade          TEXT NOT NULL CHECK (confiabilidade IN ('Alta', 'Média', 'Baixa', 'Insuficiente')),
    -- Texto livre com granularidade diaria dos eventos dentro do periodo
    -- comparado (ex.: "8 evento(s) nativo(s) em ago/24, dia 7-23") — e a
    -- vantagem de resolucao temporal do metodo frente ao MapBiomas mensal.
    validacao_temporal      TEXT,
    mapbiomas_colecao       TEXT NOT NULL DEFAULT 'Coleção 4',
    data_comparacao         DATE,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (codigo_ibge, ano)
);

CREATE INDEX idx_validacao_mapbiomas_codigo_ibge ON validacao_mapbiomas (codigo_ibge);
CREATE INDEX idx_validacao_mapbiomas_confiabilidade ON validacao_mapbiomas (confiabilidade);

COMMENT ON TABLE validacao_mapbiomas IS 'Fato: comparacao formal contra o MapBiomas Fogo. So existe linha aqui para municipio x ano ja avaliado — ausencia de linha = "nao comparado/validado" na interface (docs/DECISIONS.md secao 1.2).';
COMMENT ON COLUMN validacao_mapbiomas.confiabilidade IS 'Regra fixa (docs/DECISIONS.md secao 1.3): Alta=recall>=50% E p<0,05; Media=so um passa; Baixa=nenhum passa mas ha agrupamento; Insuficiente=nenhum agrupamento formado no ano (recall_pct/interseccao_pct/p_valor ficam NULL).';

-- =========================================================================
-- 4. status_processamento (log automatico — nao e mais gate manual)
-- =========================================================================
CREATE TABLE status_processamento (
    id              BIGSERIAL PRIMARY KEY,
    codigo_ibge     CHAR(7) REFERENCES municipios (codigo_ibge),
    etapa           TEXT NOT NULL CHECK (etapa IN ('ingest_inpe', 'process_dnbr', 'check_mapbiomas', 'audit_anual')),
    -- ASSUNCAO DE IMPLEMENTACAO (nao fechada em docs/DECISIONS.md): os 4
    -- primeiros valores sao os "ja usados na interface"; 'erro' e o 5o,
    -- so para monitoramento tecnico, nunca mostrado ao usuario final —
    -- ver docs/DECISIONS.md secao 3, ponto 3, e secao 7 (novo).
    status          TEXT NOT NULL CHECK (status IN ('pendente', 'processando', 'concluido', 'desatualizado', 'erro')),
    mensagem        TEXT,
    workflow        TEXT,
    executado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_processamento_codigo_ibge ON status_processamento (codigo_ibge, executado_em DESC);
CREATE INDEX idx_status_processamento_erro ON status_processamento (etapa, executado_em DESC) WHERE status = 'erro';

COMMENT ON TABLE status_processamento IS 'Log automatico de cada rodada do pipeline por municipio/etapa. Historico de execucao, nao gate de aprovacao (docs/DECISIONS.md secao 2.5).';

-- =========================================================================
-- 5. auditorias_anuais (log interno, oculto da interface do usuario final)
-- =========================================================================
CREATE TABLE auditorias_anuais (
    id                  BIGSERIAL PRIMARY KEY,
    ano_referencia      SMALLINT NOT NULL,
    -- NULL = auditoria geral (nao especifica de um municipio).
    codigo_ibge         CHAR(7) REFERENCES municipios (codigo_ibge),
    descricao           TEXT NOT NULL,
    executado_por       TEXT NOT NULL,
    executado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    dados_anteriores    JSONB,
    dados_novos         JSONB
);

CREATE INDEX idx_auditorias_anuais_ano ON auditorias_anuais (ano_referencia DESC);

COMMENT ON TABLE auditorias_anuais IS 'Log interno da auditoria anual (audit-anual.yml, executado manualmente pelo Pedro 1x/ano). Corrige dado historico e avanca ano_ativo. Nunca exposto na interface publica (docs/DECISIONS.md secao 2.5).';

-- =========================================================================
-- view: ano_ativo (janela de evolucao, derivada — nao e 6a tabela)
-- =========================================================================
-- ASSUNCAO DE IMPLEMENTACAO: "ano ativo" e global (nao por municipio), e
-- cai em cascata quando ainda nao ha auditoria registrada: usa o ano mais
-- recente com dado real, e so em ultimo caso o inicio da janela (2018).
-- Nao havia formula operacional fechada em docs/DECISIONS.md — ver secao 7.
CREATE VIEW ano_ativo AS
SELECT COALESCE(
    (SELECT MAX(ano_referencia) FROM auditorias_anuais),
    (SELECT MAX(ano) FROM validacao_mapbiomas),
    (SELECT MAX(ano) FROM metricas_anuais),
    2018
) AS ano;

COMMENT ON VIEW ano_ativo IS 'Ano ativo corrente da janela de evolucao (2018 em diante). Ver docs/DECISIONS.md secao 3, ponto 4, e secao 7 para a logica de fallback assumida.';
