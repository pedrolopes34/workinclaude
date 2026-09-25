# /pipeline

Processamento que escreve no banco: ingestão dos focos de calor (INPE),
ST-DBSCAN, dNBR (Sentinel-2/Google Earth Engine) e a comparação/validação
contra o MapBiomas Fogo. É quem popula o Postgres/PostGIS lido pelo
`/webapp` e pela `/api`.

Decisões de arquitetura, proveniência dos notebooks portados e pendências
técnicas: `docs/DECISIONS.md` seções 6.11 a 6.15.

## Setup

```bash
cd pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # aponta pro Postgres local — ver /pipeline/db/README.md
```

## Estrutura

| Módulo | O que faz | Testado nesta sessão? |
|---|---|---|
| `common/db.py` | Conexão Postgres (`DATABASE_URL`, mesmo padrão do `/webapp`) | Sim — usado no teste ponta-a-ponta abaixo |
| `common/geo.py` | Fuso UTM/SIRGAS2000 por longitude, projeção de focos pra metros, união de buffers | Sim (`tests/pipeline/`) |
| `common/ibge_malhas.py` | Polígono do município via API de malhas do IBGE (substitui o shapefile `SP_Municipios_2024` dos notebooks, ainda não importado em `/geodata`) | Não — API bloqueada neste sandbox (`docs/DECISIONS.md` seção 6.2) |
| `ingest/inpe.py` | Baixa/lê o CSV anual do INPE, cruza com `municipios` por nome normalizado | Parcial — parsing/cruzamento testado; URL de download **não confirmada** |
| `stdbscan/core.py` | ST-DBSCAN oficial (`eps_space_km=3`, `eps_time_days=1`) + `calcular_min_samples` (fórmula validada contra os 12 casos reais) | Sim |
| `dnbr/sentinel2.py` | Cálculo do dNBR via Sentinel-2/GEE, com fallback de nuvem e checagem de cobertura real de pixels | Não — precisa de rede/credenciais do Earth Engine, indisponíveis neste sandbox de propósito |
| `dnbr/validacao.py` | Severidade espectral por evento (buffer 500 m + `rasterstats`) | Sim (raster sintético) |
| `run_ingest_stdbscan.py` | CLI que liga ingestão + ST-DBSCAN e grava em `metricas_anuais` — processa o **ano corrente inteiro**, não um mês específico (seção 6.13) | Sim, ponta-a-ponta contra o Postgres local (dados sintéticos) |
| `run_dnbr.py` | CLI que orquestra o dNBR pra um grupo de municípios (particiona os 645 em N fatias) e grava `area_dnbr_km2` — compara mês anterior x mês corrente, cálculo síncrono via `reduceRegion` (sem exportar GeoTIFF) | Parcial — só a lógica pura (`janela_mes_anterior`, `dividir_em_grupo`) é testada; o cálculo em si precisa de GEE |
| `validacao/mapbiomas.py` | IoU/Jaccard, recall, teste de permutação (999x) e classificação de confiabilidade (4 níveis) | Sim — 12 testes, incluindo os 5 exemplos documentados em `docs/DECISIONS.md` seção 1.3; mecânica do teste de permutação é uma reconstrução a confirmar (seção 6.15) |

Rodar os testes: `pytest` na raiz do repositório (usa `pytest.ini`), ou
automaticamente via `.github/workflows/tests.yml` a cada push/PR.

## Workflows do GitHub Actions

| Workflow | Cadência | Status |
|---|---|---|
| `tests.yml` | a cada push/PR em `pipeline/`/`tests/` | ✅ pronto |
| `ingest-inpe.yml` | diário | ✅ pronto, mas depende da pendência da URL do INPE abaixo — precisa de `secrets.DATABASE_URL` configurado no repositório |
| `process-sentinel-dnbr.yml` | mensal, 2 jobs paralelos via `strategy.matrix` (seção 2.1) | ✅ pronto — precisa de `secrets.DATABASE_URL` e `secrets.GEE_SERVICE_ACCOUNT_KEY`; janela antes/depois (mês a mês) é uma decisão nova, não extraída de notebook (seção 6.14) |
| `check-mapbiomas.yml` | mensal | ⏳ não escrito — falta o script que verifica se há coleção nova do MapBiomas Fogo publicada |
| `audit-anual.yml` | manual, 1×/ano | ⏳ não escrito — falta o script de auditoria (grava em `auditorias_anuais`, avança `ano_ativo`) |

## O que ainda falta

- **Confirmar a origem exata do CSV do INPE** (`ingest/inpe.py`, topo do
  arquivo) — a pesquisa original usava um arquivo `focos_br_sp_ref_AAAA.csv`
  baixado manualmente; a URL pública usada aqui (`dataserver-coids.inpe.br`)
  é a única confirmada nesta sessão, mas pode não ser o mesmo produto
  ("_ref_" pode ser o satélite de referência do INPE, cientificamente
  diferente do produto "todos os satélites").
- **dNBR real** — o código (`dnbr/sentinel2.py` e a orquestração em
  `run_dnbr.py`) está pronto, mas nunca rodou de verdade — precisa da
  service account do GEE, que fica só no secret do GitHub Actions.
- **Janela antes/depois do dNBR mensal** (mês anterior x mês corrente) é
  uma decisão nova de quem escreveu isso, não extraída de nenhum notebook
  nem confirmada com o Pedro (docs/DECISIONS.md seção 6.14) — revisitar se
  gerar falso positivo por fumaça de incêndio ainda ativo.
- **`/geodata`** — quando a malha municipal `SP_Municipios_2024` for
  importada pro banco, `common/ibge_malhas.py` pode ser trocado por uma
  consulta direta à coluna `municipios.geom`, evitando a chamada de rede por
  município a cada rodada.
- **Orquestração da validação MapBiomas** (`run_validacao_mapbiomas.py`,
  `check-mapbiomas.yml`) — o núcleo estatístico (`validacao/mapbiomas.py`)
  está pronto e testado, mas o script que liga tudo está bloqueado em 3
  pendências (docs/DECISIONS.md seção 6.15): mecânica exata do teste de
  permutação a confirmar, geometria dos agrupamentos não é persistida em
  lugar nenhum hoje (só a área agregada), e a fonte exata do raster do
  MapBiomas Fogo no Earth Engine não está confirmada.
