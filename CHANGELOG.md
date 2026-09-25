# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Não lançado]

### Adicionado
- Esqueleto dos 8 componentes do projeto (`/data`, `/geodata`, `/pipeline`,
  `/webapp`, `/api`, `/tests`, `/security`, `/docs`).
- Schema do banco Postgres + PostGIS (5 tabelas + view `ano_ativo`) em
  `pipeline/db/schema.sql`.
- Seeds reais: 645 municípios de SP e os 63 municípios já validados pela
  pesquisa (dados de `Tabela_Final_63_Municipios.xlsx`), com confiabilidade
  calculada pela regra de 4 níveis já fechada.
- Webapp Next.js (App Router, TypeScript, Tailwind) com busca de município
  e página de detalhe, lendo direto do banco.
- Restyle visual da interface inspirado nos diálogos do Claude.
- Estados de carregamento e erro, 404 personalizada, metadata por página,
  `robots.txt`, `sitemap.xml` e favicon (placeholder).
- Banco de produção criado no Neon (Postgres + PostGIS), populado e
  conferido.
- `CITATION.cff` e este `CHANGELOG.md`.
- `/pipeline` real: ingestão de focos do INPE, ST-DBSCAN oficial (com
  `min_samples` calculado por município em vez de constante fixa) e
  validação de severidade do dNBR, portados dos notebooks de pesquisa e
  cobertos por 34 testes automatizados (`pytest`).

### Pendente
Ver `docs/CHECKLIST.md` para o restante (SEO, segurança, CI/CD, cálculo real
do dNBR via Earth Engine, comparação com MapBiomas, `/api`, mapa
interativo).
