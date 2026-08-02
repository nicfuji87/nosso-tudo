import { defineConfig } from "vitest/config";

// Testes unitários da lógica pura (lib/viagens/caminho.ts e afins). Não sobe
// Next nem Supabase de propósito: o motor de milhas é puro justamente para
// poder ser provado sem infra.
//
// .mts porque o package.json não é ESM — sem isso o Vite avisa a cada run.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
