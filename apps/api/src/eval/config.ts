import { parseEnv } from "@nexo/shared/config";
import { llmSchema, type LlmConfig } from "../config.ts";

/**
 * A avaliação só precisa do modelo: LLM_MODE (mock ou gemini) e, no gemini, a chave e o modelo.
 * Nada do banco, da porta HTTP nem do serviço de chamados, que ela não usa (menor privilégio).
 */
export function loadEvalConfig(
  source: Record<string, string | undefined> = process.env,
): LlmConfig {
  return parseEnv(llmSchema, source);
}
