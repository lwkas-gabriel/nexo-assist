import { parseEnv } from "@nexo/shared/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  return parseEnv(envSchema, process.env);
}
