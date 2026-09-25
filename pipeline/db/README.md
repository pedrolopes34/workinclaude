# /pipeline/db

Schema e seeds do Postgres + PostGIS. Ver `docs/DECISIONS.md` seções 3 e 6
para as decisões de modelagem (incluindo suposições de implementação ainda
pendentes de revisão do Pedro).

## Setup local (desenvolvimento)

```bash
sudo service postgresql start
sudo -u postgres createdb queimadas_sp
sudo -u postgres psql -d queimadas_sp -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f seeds/001_seed_municipios.sql
psql "$DATABASE_URL" -f seeds/002_seed_metricas_anuais_2024.sql
psql "$DATABASE_URL" -f seeds/003_seed_validacao_mapbiomas_2024.sql
```

Em produção, `DATABASE_URL` aponta para o Neon — nenhum código muda, só a
variável de ambiente (ver `docs/DECISIONS.md` seção 6.6).

## Seeds

- `seeds/raw/municipios_sp.csv` — os 645 municípios de SP (código IBGE +
  nome). Fonte em `seeds/raw/SOURCES.md`.
- `seeds/raw/validacao_mapbiomas_63.csv` — transcrição de
  `Tabela_Final_63_Municipios.xlsx` (comparação agosto/2024 vs. MapBiomas
  Fogo Coleção 4, os 63 municípios já validados pela pesquisa).
- `seeds/generate_seed_sql.py` — lê os dois CSVs acima e gera os 3 arquivos
  `NNN_seed_*.sql`. Recalcula a `confiabilidade` de cada município a partir
  de Recall/p-valor, aplicando a regra fixa da seção 1.3 do
  `docs/DECISIONS.md` — não copia nenhuma coluna de classificação da
  planilha original. Rodar de novo com `python3 generate_seed_sql.py`
  sempre que os CSVs de origem mudarem.

**Import ainda pendente:** só os 63 municípios da amostra têm
`metricas_anuais`/`validacao_mapbiomas` populados. Os outros 582 aparecem
em `municipios` (dimensão) mas sem nenhuma métrica — é o esperado, mostram
"não comparado/validado" na interface.
