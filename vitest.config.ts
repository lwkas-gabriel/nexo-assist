import { defineConfig } from "vitest/config";

// Um projeto por pacote, para cada um declarar seu ambiente (node ou navegador) explicitamente.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.ts"],
          environment: "node",
        },
      },
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
          // Funções puras do front.
          name: "web",
          include: ["apps/web/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          // Componentes, num navegador simulado (jsdom), com o Testing Library.
          name: "web-components",
          include: ["apps/web/src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["apps/web/src/test-setup.ts"],
        },
      },
      {
        test: {
          name: "api",
          include: ["apps/api/src/**/*.test.ts"],
          environment: "node",
          // Turnos do agent com banco e streaming: com a suíte inteira em paralelo, os mais longos
          // chegavam perto dos 5 s padrão e falhavam por tempo, não por erro.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
