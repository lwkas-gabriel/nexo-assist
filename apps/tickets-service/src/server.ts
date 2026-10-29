import { serve } from "@hono/node-server";
import { systemClock } from "@nexo/shared/domain";
import { createApp } from "./app.ts";
import { createTicketService } from "./app/ticket-service.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { seedDatabase } from "./seed/seed-database.ts";

const config = loadConfig();
const { db } = await openDatabase(config.DATABASE_URL);

if (config.SEED_ON_START) {
  const count = await seedDatabase(db, systemClock.now());
  console.log(`tickets-service: ${count} chamados de demonstração recriados`);
}

const app = createApp({
  ticketService: createTicketService({ db, clock: systemClock }),
  db,
  clock: systemClock,
  serviceToken: config.SERVICE_TOKEN,
  failureRate: config.FAILURE_RATE,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(
    `tickets-service ouvindo em http://localhost:${info.port} (falhas simuladas: ${config.FAILURE_RATE * 100}%)`,
  );
});

// Encerramento limpo: para de aceitar conexões e termina as que estão em andamento.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
