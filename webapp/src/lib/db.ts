import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

// Singleton para nao abrir uma pool nova a cada hot-reload em dev.
// DATABASE_URL aponta para o Postgres local em dev; em producao, para o
// Neon — nenhum codigo muda, so a variavel de ambiente (docs/DECISIONS.md
// secao 6.6).
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL nao definida. Copie .env.example para .env.local e preencha."
  );
}

export const sql =
  global.__sql ??
  postgres(connectionString, {
    max: 10,
    transform: postgres.camel, // colunas snake_case do banco -> camelCase no JS
  });

if (process.env.NODE_ENV !== "production") {
  global.__sql = sql;
}
