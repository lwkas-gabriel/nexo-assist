import { parseEnv } from "@nexo/shared/config";
import { z } from "zod";

/**
 * LLM_MODE=anthropic usa o Claude de verdade e exige chave e modelo.
 * LLM_MODE=mock usa um modelo falso roteirizado (testes E2E e CI), sem custo e sem chave.
 */
const llmSchema = z.discriminatedUnion("LLM_MODE", [
  z.object({
    LLM_MODE: z.literal("anthropic"),
    ANTHROPIC_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1),
  }),
  z.object({
    LLM_MODE: z.literal("mock"),
  }),
]);

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive(),
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
