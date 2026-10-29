/** Volta a api ao estado inicial de demonstração (uso: pnpm db:seed). Apaga conversas e sessões. */
import { DEMO_USERS } from "@nexo/shared/demo";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { resetDemoData } from "./db/demo-data.ts";
import { createUserStore } from "./db/user-store.ts";

const config = loadConfig();
const { db, client } = await openDatabase(config.DATABASE_URL);
await resetDemoData(db);
await createUserStore(db).upsertAll(DEMO_USERS);
client.close();

console.log(`api: conversas apagadas e ${DEMO_USERS.length} pessoas de demonstração gravadas`);
