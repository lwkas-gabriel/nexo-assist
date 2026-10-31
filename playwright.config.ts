import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

/**
 * Os testes sobem servidores próprios, em portas separadas do `pnpm dev`, sempre com o modelo
 * falso (LLM_MODE=mock): rodar os testes nunca chama o modelo real nem gasta a cota gratuita.
 */
const E2E_TICKETS_PORT = "3101";
const E2E_API_PORT = "3100";
const E2E_WEB_PORT = "5174";
/** Token gerado a cada execução: nenhum segredo fica escrito na configuração. */
const E2E_SERVICE_TOKEN = randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "e2e",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    trace: "retain-on-failure",
  },
  // Fluxos validados no desktop do protótipo e num celular (ver docs/FRONTEND.md 10.6).
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // Banco em memória com os dados de demonstração e sem falhas simuladas: testes determinísticos.
      command: "pnpm --filter @nexo/tickets-service start",
      env: {
        PORT: E2E_TICKETS_PORT,
        DATABASE_URL: ":memory:",
        SERVICE_TOKEN: E2E_SERVICE_TOKEN,
        FAILURE_RATE: "0",
        SEED_ON_START: "true",
      },
      url: `http://localhost:${E2E_TICKETS_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @nexo/api start",
      env: {
        PORT: E2E_API_PORT,
        LLM_MODE: "mock",
        DATABASE_URL: ":memory:",
        COOKIE_SECURE: "false",
        SEED_ON_START: "false",
        TICKETS_SERVICE_URL: `http://localhost:${E2E_TICKETS_PORT}`,
        TICKETS_SERVICE_TOKEN: E2E_SERVICE_TOKEN,
        // Sem cota de modelo real no modo mock: tetos altos para os testes em paralelo.
        CHAT_MESSAGES_PER_MINUTE: "1000",
        CHAT_MESSAGES_PER_DAY: "1000",
      },
      url: `http://localhost:${E2E_API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @nexo/web exec vite --port ${E2E_WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://localhost:${E2E_API_PORT}` },
      url: `http://localhost:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
