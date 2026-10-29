import { serve } from "@hono/node-server";
import { systemClock } from "@nexo/shared/domain";
import { createApp } from "./app.ts";
import { createTicketService } from "./app/ticket-service.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/database.ts";

const config = loadConfig();
const { db } = await openDatabase(config.DATABASE_URL);
const app = createApp({
  ticketService: createTicketService({ db, clock: systemClock }),
  serviceToken: config.SERVICE_TOKEN,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`tickets-service ouvindo em http://localhost:${info.port}`);
});

// Encerramento limpo: para de aceitar conexões e termina as que estão em andamento.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
