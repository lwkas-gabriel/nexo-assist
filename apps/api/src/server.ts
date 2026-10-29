import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createContainer } from "./container.ts";

/** Build do front (pnpm build). Em produção a api o entrega; no desenvolvimento quem serve é o Vite. */
const WEB_DIST_DIRECTORY = join(import.meta.dirname, "..", "..", "web", "dist");
const hasWebBuild = existsSync(join(WEB_DIST_DIRECTORY, "index.html"));

const config = loadConfig();
const app = createApp(createContainer(config), {
  webDistDirectory: hasWebBuild ? WEB_DIST_DIRECTORY : undefined,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(
    `api ouvindo em http://localhost:${info.port} (modelo: ${config.LLM_MODE}, front: ${hasWebBuild ? "build" : "não servido"})`,
  );
});

// Encerramento limpo: para de aceitar conexões e termina as que estão em andamento.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
