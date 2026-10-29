import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const server = serve({ fetch: createApp().fetch, port: config.PORT }, (info) => {
  console.log(`tickets-service ouvindo em http://localhost:${info.port}`);
});

// Encerramento limpo: para de aceitar conexões e termina as que estão em andamento.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
