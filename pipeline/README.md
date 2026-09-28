# /pipeline

Processamento que escreve no banco: ingestão dos focos de calor (INPE),
ST-DBSCAN, dNBR (Sentinel-2/Google Earth Engine) e a comparação/validação
contra o MapBiomas Fogo. É quem popula o Postgres/PostGIS lido pelo
`/webapp` e pela `/api`.

Decisões de arquitetura, proveniência dos notebooks portados e pendências
técnicas: `docs/DECISIONS.md` seções 6.11 a 6.22.

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
| `ingest/inpe.py` | Baixa os focos do INPE: nos anos fechados, o arquivo anual do satélite de referência (`anual/EstadosBr_sat_ref/SP/focos_br_sp_ref_AAAA.zip`, o mesmo da pesquisa, ou o do Brasil); no ano corrente, os mensais (`.csv` ou `.zip`), filtrando o satélite de referência. Cruza com `municipios` por nome normalizado | Sim — download real conferido 2003-2026 (seção 6.55); testes com respostas falsas |
| `stdbscan/core.py` | ST-DBSCAN oficial (`eps_space_km=3`, `eps_time_days=1`) + `calcular_min_samples` (fórmula validada contra os 12 casos reais) + `poligono_stdbscan_municipio` | Sim |
| `dnbr/sentinel2.py` | Cálculo do dNBR via Sentinel-2/GEE, com fallback de nuvem e checagem de cobertura real de pixels | Não — precisa de rede/credenciais do Earth Engine, indisponíveis neste sandbox de propósito |
| `dnbr/validacao.py` | Severidade espectral por evento (buffer 500 m + `rasterstats`) | Sim (raster sintético) |
| `validacao/mapbiomas.py` | IoU/Jaccard, recall, teste de permutação (999x) e classificação de confiabilidade (4 níveis) | Sim — 12 testes, incluindo os 5 exemplos documentados em `docs/DECISIONS.md` seção 1.3; mecânica do teste de permutação é uma reconstrução a confirmar (seção 6.15) |
| `validacao/mapbiomas_gee.py` | Busca a área queimada do MapBiomas Fogo no Earth Engine | Não — precisa de GEE; asset trocado pro anual com evidência mais forte, ainda não confirmado (seção 6.21) |
| `run_ingest_stdbscan.py` | CLI que liga ingestão + ST-DBSCAN e grava em `metricas_anuais` — processa o **ano corrente inteiro**, não um mês específico (seção 6.13) | Sim, ponta-a-ponta contra o Postgres local (dados sintéticos) |
| `run_dnbr.py` | CLI que orquestra o dNBR pra um grupo de municípios e grava `area_dnbr_km2` — compara o último mês completo com o anterior (seção 6.55), cálculo síncrono via `reduceRegion` (sem exportar GeoTIFF). Também gera `dnbr_imagem_url` (miniatura PNG colorida via `getThumbURL` + Cloudflare R2, seção 6.40) quando os secrets `R2_*` existem — opcional, nunca bloqueia a gravação de `area_dnbr_km2` | Parcial — só a lógica pura (`mes_a_processar`, `janela_mes_especifico`, `_r2_configurado`) é testada; o cálculo em si precisa de GEE |
| `run_dnbr_estado.py` | Mosaico estadual da leitura de satélite por mês (seção 6.55): mesmo cálculo e paleta das miniaturas, numa imagem só do estado, no retângulo do mapa do site; WebP no R2 + `mosaicos_dnbr` | Parcial — funções puras testadas; rodado de verdade pra ago/2024 |
| `run_validacao_mapbiomas.py` | CLI que reconstrói o ST-DBSCAN (pra obter a geometria), compara contra o MapBiomas e grava em `validacao_mapbiomas` | Parcial — só as partes que orquestra são testadas isoladamente |
| `verificar_saude.py` | Verificação diária de saúde (seção 6.56): ingestão dos focos, mapa do estado, miniaturas do mês, consultas, última execução de cada workflow na main e o site no ar; com `--alertar`, abre/comenta/fecha a issue "Alerta do painel" | Sim — regras e o fluxo da issue com o GitHub simulado (30 testes); SQL conferido no Postgres local e 1ª rodada real em produção |
| `run_audit_anual.py` | CLI da auditoria manual anual — grava em `auditorias_anuais` (avança `ano_ativo`), com correção pontual opcional de um campo de `metricas_anuais`/`validacao_mapbiomas` (lista fixa em `CAMPOS_CORRIGIVEIS`) | Parcial — validação de campo e coerção de tipo testadas; escrita real precisa de `DATABASE_URL` |

Rodar os testes: `pytest` na raiz do repositório (usa `pytest.ini`), ou
automaticamente via `.github/workflows/tests.yml` a cada push/PR.

## Workflows do GitHub Actions

Os 4 workflows planejados desde `docs/DECISIONS.md` seção 2.4, mais o
`audit-anual.yml` da seção 2.5, estão todos escritos. Execução real em
andamento nesta sessão — ver `docs/DECISIONS.md` seções 6.17/6.18 pro
histórico das tentativas e o que já foi confirmado (IAM do GEE) vs. o que
tem evidência forte mas ainda não confirmação real (URL mensal do INPE).

| Workflow | Cadência | Precisa de |
|---|---|---|
| `tests.yml` | a cada push/PR em `pipeline/`/`tests/` | nada — já roda de verdade |
| `ingest-inpe.yml` | diário, 09:17 UTC | `secrets.DATABASE_URL`; anual de referência nos anos fechados, mensal no ano corrente (seção 6.55) |
| `process-sentinel-dnbr.yml` | mensal, 2 jobs paralelos (seção 2.1) | `secrets.DATABASE_URL`, `secrets.GEE_SERVICE_ACCOUNT_KEY`; processa o último mês completo (antes a janela saía vazia no dia 1, seção 6.55) |
| `dnbr-estado.yml` | mensal (dia 1) + manual por mês ou lote por ano | mesmos secrets do dNBR, com o R2 obrigatório (seção 6.55) |
| `check-mapbiomas.yml` | manual, quando sair coleção nova do MapBiomas Fogo (seção 6.50); 2 jobs paralelos | mesmos secrets do dNBR; das 3 pendências da seção 6.15 só resta conferir a mecânica da permutação contra o notebook oficial (seção 6.35) |
| `saude-diaria.yml` | diário, 20:41 UTC + manual | `secrets.DATABASE_URL` e o `GITHUB_TOKEN` automático (lê execuções, abre issue de alerta só na main — seção 6.56) |
| `webapp.yml` | a cada push/PR em `webapp/` | nada — lint, tipagem e testes Vitest do webapp (seção 6.56) |
| `audit-anual.yml` | manual, 1×/ano, executado pelo Pedro | `secrets.DATABASE_URL`; sem pendência externa — só depende de o Pedro decidir o que auditar |

## O que ainda falta antes de habilitar de verdade

- **Confirmar a origem exata do CSV do INPE** (`ingest/inpe.py`, topo do
  arquivo) — a pesquisa original usava um arquivo `focos_br_sp_ref_AAAA.csv`
  baixado manualmente pelo portal BDQueimadas (sem URL fixa programável).
  O produto anual "todos os satélites" não existe no dataserver do INPE
  (404 real; a versão atual baixa os 12 meses e concatena, seção 6.18,
  com evidência forte de busca mas ainda não confirmada rodando de
  verdade); mesmo confirmando a URL mensal, pode não ser o mesmo produto
  do "_ref_" original. Próximo passo concreto, se a próxima rodada real
  ainda falhar: inspecionar a aba Network do navegador durante um download
  manual real pelo BDQueimadas.
- **Confirmar o asset do MapBiomas Fogo no Earth Engine**
  (`validacao/mapbiomas_gee.py`) — trocado pro asset anual (Coleção 4,
  bandas nomeadas `burned_coverage_{ano}`), evidência bem mais forte que a
  1ª tentativa mas ainda não confirmado contra a fonte primária nem
  executado de verdade (seção 6.21).
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
