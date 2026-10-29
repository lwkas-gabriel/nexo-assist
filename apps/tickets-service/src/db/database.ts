import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { runMigrations } from "@nexo/shared/db";
import * as schema from "./schema.ts";

const MIGRATIONS_DIRECTORY = join(import.meta.dirname, "..", "..", "migrations");

/**
 * Abre o banco e aplica as migrações pendentes.
 * `url` vem do config (ex.: file:./data/tickets.db); ":memory:" serve para testes.
 */
export async function openDatabase(url: string) {
  ensureDirectoryFor(url);
  const client = createClient({ url });
  // O SQLite só respeita as chaves estrangeiras com este pragma ligado.
  await client.execute("PRAGMA foreign_keys = ON");
  await runMigrations(client, MIGRATIONS_DIRECTORY);
  return { client, db: drizzle(client, { schema }) };
}

export type Database = Awaited<ReturnType<typeof openDatabase>>["db"];

function ensureDirectoryFor(url: string) {
  if (!url.startsWith("file:")) return;
  mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
}
