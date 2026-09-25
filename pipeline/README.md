# /pipeline

Processamento que escreve no banco: ingestão dos focos de calor (INPE),
ST-DBSCAN, dNBR (Sentinel-2/Google Earth Engine) e a comparação/validação
contra o MapBiomas Fogo. É quem popula o Postgres/PostGIS lido pelo
`/webapp` e pela `/api`.

Decisões de arquitetura, proveniência dos notebooks portados e pendências
técnicas: `docs/DECISIONS.md` seções 6.11 e 6.12.

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
| `run_ingest_stdbscan.py` | CLI que liga ingestão + ST-DBSCAN e grava em `metricas_anuais` | Sim, ponta-a-ponta contra o Postgres local (dados sintéticos) |

Rodar os testes: `pytest` na raiz do repositório (usa `pytest.ini`).

## O que ainda falta

- **Confirmar a origem exata do CSV do INPE** (`ingest/inpe.py`, topo do
  arquivo) — a pesquisa original usava um arquivo `focos_br_sp_ref_AAAA.csv`
  baixado manualmente; a URL pública usada aqui (`dataserver-coids.inpe.br`)
  é a única confirmada nesta sessão, mas pode não ser o mesmo produto
  ("_ref_" pode ser o satélite de referência do INPE, cientificamente
  diferente do produto "todos os satélites").
- **dNBR real** — o código está portado fielmente dos notebooks, mas nunca
  rodou de verdade (precisa da service account do GEE, que fica só no
  secret do GitHub Actions).
- **`/geodata`** — quando a malha municipal `SP_Municipios_2024` for
  importada pro banco, `common/ibge_malhas.py` pode ser trocado por uma
  consulta direta à coluna `municipios.geom`, evitando a chamada de rede por
  município a cada rodada.
- **Os 4 workflows do GitHub Actions** (`ingest-inpe.yml`,
  `process-sentinel-dnbr.yml`, `check-mapbiomas.yml`, `audit-anual.yml`) —
  ainda não escritos.
- **`validacao_mapbiomas`** (IoU/Jaccard + teste de permutação contra o
  MapBiomas Fogo) — metodologia confirmada nos notebooks (`06_09`, `F10`),
  ainda não portada pra código de produção.
