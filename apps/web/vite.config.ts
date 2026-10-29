import { parseEnv } from "@nexo/shared/config";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { z } from "zod";

const devEnvSchema = z.object({
  API_PROXY_TARGET: z.url(),
});

export default defineConfig(({ command, mode }) => {
  // No build de produção não há proxy: a api serve o front na mesma origem.
  if (command === "build") {
    return { plugins: [react()] };
  }

  const env = parseEnv(devEnvSchema, loadEnv(mode, ".", ""));
  return {
    plugins: [react()],
    server: {
      // Mesma origem no dev, como em produção: cookies de sessão e a proteção contra CSRF
      // dependem disso. changeOrigin: false mantém o Host original (a forma curta o reescreve).
      proxy: { "/api": { target: env.API_PROXY_TARGET, changeOrigin: false } },
    },
  };
});
