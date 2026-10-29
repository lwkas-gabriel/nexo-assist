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
    ],
  },
});
