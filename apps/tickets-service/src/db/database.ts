import { join } from "node:path";
import { openMigratedClient } from "@nexo/shared/db";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

const MIGRATIONS_DIRECTORY = join(import.meta.dirname, "..", "..", "migrations");

/** Abre o banco do serviço de chamados com as migrações aplicadas. */
export async function openDatabase(url: string) {
  const client = await openMigratedClient(url, MIGRATIONS_DIRECTORY);
  return { client, db: drizzle(client, { schema }) };
}

export type Database = Awaited<ReturnType<typeof openDatabase>>["db"];
