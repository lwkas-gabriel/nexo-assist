import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "./migrate.ts";

/**
 * Abre um banco SQLite (libSQL) e aplica as migrações pendentes da pasta indicada.
 * `url` vem do config (ex.: file:./data/api.db); ":memory:" serve para testes.
 */
export async function openMigratedClient(
  url: string,
  migrationsDirectory: string,
): Promise<Client> {
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url });
  // O SQLite só respeita as chaves estrangeiras com este pragma ligado.
  await client.execute("PRAGMA foreign_keys = ON");
  await runMigrations(client, migrationsDirectory);
  return client;
}
