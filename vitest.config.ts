import { defineConfig } from "vitest/config";

// Um projeto por pacote, para cada um declarar seu ambiente (node ou navegador) explicitamente.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["packages/shared/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "tickets-service",
          include: ["apps/tickets-service/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          // Por enquanto só funções puras do front; componentes ganham ambiente de navegador na T17.
          name: "web",
          include: ["apps/web/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "api",
          include: ["apps/api/src/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
