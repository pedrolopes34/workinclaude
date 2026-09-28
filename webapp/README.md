# Painel de Queimadas SP — webapp

Next.js (App Router, TypeScript, Tailwind v4). Lê direto do Postgres/PostGIS
do `/pipeline` — nunca passa pela `/api` internamente (ver `CLAUDE.md` na
raiz do repositório).

## Rodando localmente

1. Suba o banco e aplique schema + seeds — ver `pipeline/db/README.md`.
2. `cp .env.example .env.local` e preencha `DATABASE_URL`.
3. `npm install`
4. `npm run dev` — abre em [http://localhost:3000](http://localhost:3000).

## O que já existe

- `/` — os 645 municípios: mapas do estado (leitura de satélite do mês e
  confiabilidade do ano), busca por nome ou código IBGE, lista agrupada por
  nível de confiabilidade e o CSV completo.
- `/mapa` — os dois mapas do estado lado a lado (mês e ano na URL) e o mapa
  de focos por município.
- `/municipio/[codigoIbge]` — ano a ano desde 2018 (focos, agrupamentos,
  leitura de satélite, comparação com o MapBiomas Fogo) e a consulta por mês.
- `/comparar`, `/como-produzimos`, `/quem-somos`, `/dados/municipios.csv`.

## Testes

- `npm test` — Vitest (lógica de `src/lib`, rotas de `/api/consultas` e o
  CSV, com o banco simulado; `docs/DECISIONS.md` seção 6.56).
- `npm run lint` e `npm run typecheck`.
- No CI: `.github/workflows/webapp.yml` a cada push/PR em `webapp/`. O
  build é da Vercel (precisa do banco).

## O que falta

Ver `docs/CHECKLIST.md`.

## Decisões relevantes

`docs/DECISIONS.md` seção 6 (acesso ao banco via `postgres`, sem ORM; fontes
dos dados de seed; suposições de schema ainda pendentes de revisão do
Pedro).
