import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createContainer } from "./container.ts";

const config = loadConfig();
const app = createApp(createContainer(config));

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api ouvindo em http://localhost:${info.port} (modelo: ${config.LLM_MODE})`);
});

// Encerramento limpo: para de aceitar conexões e termina as que estão em andamento.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
