# /pipeline

Processamento que escreve no banco: ingestão dos focos de calor (INPE),
ST-DBSCAN, dNBR (Sentinel-2/Google Earth Engine) e a comparação/validação
contra o MapBiomas Fogo. É quem popula o Postgres/PostGIS lido pelo
`/webapp` e pela `/api`.

Decisões de arquitetura, proveniência dos notebooks portados e pendências
técnicas: `docs/DECISIONS.md` seções 6.11 a 6.16.

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
| `common/particionamento.py` | Divide os 645 municípios em N grupos pra jobs paralelos | Sim |
| `common/ibge_malhas.py` | Polígono do município via API de malhas do IBGE (substitui o shapefile `SP_Municipios_2024` dos notebooks, ainda não importado em `/geodata`) | Não — API bloqueada neste sandbox (`docs/DECISIONS.md` seção 6.2) |
| `ingest/inpe.py` | Baixa/lê o CSV anual do INPE, cruza com `municipios` por nome normalizado | Parcial — parsing/cruzamento testado; URL de download **não confirmada** |
| `stdbscan/core.py` | ST-DBSCAN oficial (`eps_space_km=3`, `eps_time_days=1`) + `calcular_min_samples` (fórmula validada contra os 12 casos reais) + `poligono_stdbscan_municipio` | Sim |
| `dnbr/sentinel2.py` | Cálculo do dNBR via Sentinel-2/GEE, com fallback de nuvem e checagem de cobertura real de pixels | Não — precisa de rede/credenciais do Earth Engine, indisponíveis neste sandbox de propósito |
| `dnbr/validacao.py` | Severidade espectral por evento (buffer 500 m + `rasterstats`) | Sim (raster sintético) |
| `validacao/mapbiomas.py` | IoU/Jaccard, recall, teste de permutação (999x) e classificação de confiabilidade (4 níveis) | Sim — 12 testes, incluindo os 5 exemplos documentados em `docs/DECISIONS.md` seção 1.3; mecânica do teste de permutação é uma reconstrução a confirmar (seção 6.15) |
| `validacao/mapbiomas_gee.py` | Busca a área queimada do MapBiomas Fogo no Earth Engine | Não — precisa de GEE; asset **não confirmado** (seção 6.15/6.16) |
| `run_ingest_stdbscan.py` | CLI que liga ingestão + ST-DBSCAN e grava em `metricas_anuais` — processa o **ano corrente inteiro**, não um mês específico (seção 6.13) | Sim, ponta-a-ponta contra o Postgres local (dados sintéticos) |
| `run_dnbr.py` | CLI que orquestra o dNBR pra um grupo de municípios e grava `area_dnbr_km2` — compara mês anterior x mês corrente, cálculo síncrono via `reduceRegion` (sem exportar GeoTIFF) | Parcial — só a lógica pura (`janela_mes_anterior`) é testada; o cálculo em si precisa de GEE |
| `run_validacao_mapbiomas.py` | CLI que reconstrói o ST-DBSCAN (pra obter a geometria), compara contra o MapBiomas e grava em `validacao_mapbiomas` | Parcial — só as partes que orquestra são testadas isoladamente |

Rodar os testes: `pytest` na raiz do repositório (usa `pytest.ini`), ou
automaticamente via `.github/workflows/tests.yml` a cada push/PR.

## Workflows do GitHub Actions

Os 4 workflows planejados desde `docs/DECISIONS.md` seção 2.4 estão todos
escritos. Nenhum foi executado de verdade nesta sessão (dependem dos
secrets do repositório e das pendências externas abaixo).

| Workflow | Cadência | Precisa de |
|---|---|---|
| `tests.yml` | a cada push/PR em `pipeline/`/`tests/` | nada — já roda de verdade |
| `ingest-inpe.yml` | diário | `secrets.DATABASE_URL`; URL do INPE não confirmada |
| `process-sentinel-dnbr.yml` | mensal, 2 jobs paralelos (seção 2.1) | `secrets.DATABASE_URL`, `secrets.GEE_SERVICE_ACCOUNT_KEY`; janela mês-a-mês é decisão nova não confirmada (seção 6.14) |
| `check-mapbiomas.yml` | mensal, 2 jobs paralelos (seção 6.16) | mesmos secrets do dNBR; herda as 3 pendências da seção 6.15 |
| `audit-anual.yml` | manual, 1×/ano, executado pelo Pedro | ⏳ não escrito — é o controle manual da seção 2.5, sem urgência (só roda 1x/ano) |

## O que ainda falta antes de habilitar de verdade

- **Confirmar a origem exata do CSV do INPE** (`ingest/inpe.py`, topo do
  arquivo) — a pesquisa original usava um arquivo `focos_br_sp_ref_AAAA.csv`
  baixado manualmente pelo portal BDQueimadas (sem URL fixa programável);
  a URL pública usada aqui (`dataserver-coids.inpe.br`) é a única
  confirmada nesta sessão, mas pode não ser o mesmo produto ("_ref_" pode
  ser o satélite de referência do INPE, cientificamente diferente do
  produto "todos os satélites"). Próximo passo concreto: inspecionar a aba
  Network do navegador durante um download manual real.
- **Confirmar o asset do MapBiomas Fogo no Earth Engine**
  (`validacao/mapbiomas_gee.py`) — 2 candidatos encontrados por busca na
  web, nenhum verificado (seção 6.15).
- **Confirmar a mecânica exata do teste de permutação** contra o notebook
  oficial (`Comparativo_Oficial_IoUJaccardPixels_CORRIGIDO_v3.ipynb`, > 10
  MB, não coube na ferramenta de Drive desta sessão) — a versão atual é uma
  reconstrução a partir do padrão da literatura (seção 6.15).
- **dNBR e validação MapBiomas reais** — o código está pronto, mas nunca
  rodou de verdade; precisa da service account do GEE (secret do GitHub
  Actions) e de dado real do INPE.
- **Desempenho de `run_validacao_mapbiomas.py` em escala** — nunca medido
  (999 permutações × ~645 municípios); `--grupo`/`--de-grupos` existe por
  precaução, mas pode precisar de mais jobs ou menos permutações.
- **`/geodata`** — quando a malha municipal `SP_Municipios_2024` for
  importada pro banco, `common/ibge_malhas.py` pode ser trocado por uma
  consulta direta à coluna `municipios.geom`, evitando a chamada de rede por
  município a cada rodada.
- **`audit-anual.yml`** — ainda não escrito (baixa prioridade, roda só
  1×/ano pelo próprio Pedro).
