import { parseEnv } from "@nexo/shared/config";
import { z } from "zod";

const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  /** Banco SQLite do serviço (ex.: file:./data/tickets.db). */
  DATABASE_URL: z.string().min(1),
  /** Segredo compartilhado com a api; só ela pode chamar este serviço. */
  SERVICE_TOKEN: z.string().min(32),
  /** Fração das requisições que falham de propósito (0 a 1), simulando o legado instável. */
  FAILURE_RATE: z.coerce.number().min(0).max(1),
  /** Recria os dados de demonstração ao iniciar (deploy de demonstração, achado R08). */
  SEED_ON_START: booleanFlag,
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  return parseEnv(envSchema, source);
}
