/** Recria os chamados de demonstração (uso: pnpm db:seed). Apaga os chamados existentes. */
import { loadConfig } from "../config.ts";
import { openDatabase } from "../db/database.ts";
import { seedDatabase } from "./seed-database.ts";

const config = loadConfig();
const { db, client } = await openDatabase(config.DATABASE_URL);
const count = await seedDatabase(db, new Date());
client.close();

console.log(`tickets-service: ${count} chamados de demonstração gravados`);
