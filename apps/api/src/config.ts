import { parseEnv } from "@nexo/shared/config";
import { z } from "zod";

/**
 * LLM_MODE=gemini usa o Gemini no plano gratuito do Google e exige chave e modelo (ADR-0010).
 * LLM_MODE=mock usa um modelo falso roteirizado (testes E2E e CI), sem chave e sem chamadas externas.
 */
const llmSchema = z.discriminatedUnion("LLM_MODE", [
  z.object({
    LLM_MODE: z.literal("gemini"),
    GEMINI_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1),
  }),
  z.object({
    LLM_MODE: z.literal("mock"),
  }),
]);

const booleanFlag = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive(),
    /** Banco SQLite da api (ex.: file:./data/api.db). */
    DATABASE_URL: z.string().min(1),
    /** Cookie de sessão só por HTTPS: true em produção, false no desenvolvimento local (HTTP). */
    COOKIE_SECURE: booleanFlag,
    /** Apaga as conversas de demonstração ao iniciar (deploy de demonstração, achado R08). */
    SEED_ON_START: booleanFlag,
    /** Endereço do serviço de chamados (ex.: http://localhost:3001). */
    TICKETS_SERVICE_URL: z.url(),
    /** Segredo compartilhado com o serviço de chamados (gerado pelo pnpm setup:env). */
    TICKETS_SERVICE_TOKEN: z.string().min(32),
  })
  .and(llmSchema);

export type Config = z.infer<typeof envSchema>;
export type LlmConfig = z.infer<typeof llmSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  return parseEnv(envSchema, source);
}
