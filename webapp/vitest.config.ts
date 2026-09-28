import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes do /webapp (docs/DECISIONS.md seção 6.56): lógica pura de src/lib e
// as rotas de API com o banco simulado — nada aqui abre conexão de verdade.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Datas por extenso e toLocaleString dependem do fuso; o site é de SP.
    env: { TZ: "America/Sao_Paulo" },
  },
});
