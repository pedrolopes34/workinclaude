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

- `/` — busca de município (mostra a amostra validada quando sem busca; a
  busca cobre os 645).
- `/municipio/[codigoIbge]` — detalhe: métricas anuais (focos/agrupamentos)
  e, quando o município está na amostra, a comparação contra o MapBiomas
  Fogo por ano (Recall, Interseção, valor-p, confiabilidade).

## O que falta (ver `docs/CHECKLIST.md`)

Páginas institucionais ("Como produzimos", "Quem somos"), estados de
carregamento/erro dedicados, mapa interativo (depende da malha do IBGE em
`/geodata` — ainda não importada), SEO por página, testes.

## Decisões relevantes

`docs/DECISIONS.md` seção 6 (acesso ao banco via `postgres`, sem ORM; fontes
dos dados de seed; suposições de schema ainda pendentes de revisão do
Pedro).
