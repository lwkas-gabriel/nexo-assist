import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";

/**
 * Aplica, em ordem, os arquivos migrations/NNNN_nome.sql ainda não aplicados.
 * Cada migração roda numa transação e fica registrada em schema_migrations.
 * SQL escrito à mão: fácil de ler e revisar, sem gerador de migrações (ADR-0009).
 */
export async function runMigrations(
  client: Client,
  migrationsDirectory: string,
): Promise<string[]> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = await client.execute("SELECT name FROM schema_migrations");
  const appliedNames = new Set(
    applied.rows.flatMap((row) => (typeof row.name === "string" ? [row.name] : [])),
  );

  const pending = readdirSync(migrationsDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .filter((file) => !appliedNames.has(file));

  for (const file of pending) {
    const sql = readFileSync(join(migrationsDirectory, file), "utf8");
    const transaction = await client.transaction("write");
    try {
      await transaction.executeMultiple(sql);
      await transaction.execute({
        sql: "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        args: [file, Date.now()],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Falha ao aplicar a migração ${file}`, { cause: error });
    }
  }
  return pending;
}
