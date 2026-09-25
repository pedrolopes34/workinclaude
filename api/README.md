# /api

API REST (`/api/v1`) para acesso externo aos dados já processados —
componente separado do `/webapp`, que lê direto do banco e nunca passa por
aqui internamente (ver `docs/DECISIONS.md` e `CLAUDE.md`).

Ainda não implementada nesta fase. Quando implementada, deve ser somente
leitura sobre os mesmos dados do Postgres/PostGIS usado pelo `/webapp` e pelo
`/pipeline`.
