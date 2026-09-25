# /pipeline

Processamento que escreve no banco: ingestão dos focos de calor (INPE),
ST-DBSCAN, dNBR (Sentinel-2/Google Earth Engine) e a comparação/validação
contra o MapBiomas Fogo. É quem popula o Postgres/PostGIS lido pelo
`/webapp` e pela `/api`.

## `/pipeline/db`

Schema do banco (`schema.sql`) e seeds (`seeds/`) — ver
`docs/DECISIONS.md` seção 3 para as decisões de modelagem.

## O que ainda falta portar para cá

A metodologia (ST-DBSCAN + dNBR) já está validada e rodando como notebooks
Google Colab no Drive do Pedro (ver `CONTEXTO_PROJETO.md` na raiz). Portar
esses notebooks para scripts de produção deste diretório, e os 4 workflows
do GitHub Actions (`ingest-inpe.yml`, `process-sentinel-dnbr.yml`,
`check-mapbiomas.yml`, `audit-anual.yml`, ver `docs/DECISIONS.md` seção 2.4)
que vão chamá-los, é trabalho futuro — não incluído nesta primeira fase, que
focou em ter o banco populado com os dados já validados e o webapp lendo
deles de verdade.
