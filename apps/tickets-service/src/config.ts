import { parseEnv } from "@nexo/shared/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  /** Banco SQLite do serviço (ex.: file:./data/tickets.db). */
  DATABASE_URL: z.string().min(1),
  /** Segredo compartilhado com a api; só ela pode chamar este serviço. */
  SERVICE_TOKEN: z.string().min(32),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  return parseEnv(envSchema, source);
}
