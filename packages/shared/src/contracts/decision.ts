import { z } from "zod";

/**
 * Registro de decisão de uma resposta (RF05), como a api o manda nos metadados da mensagem.
 * A tela valida com este schema antes de mostrar o detalhe; a api tem um teste que garante que
 * o registro que ela gera cumpre o mesmo contrato.
 */
export const decisionViewSchema = z.object({
  /** Intenção entendida, já com o rótulo em português ("abrir chamado"). */
  intent: z.string(),
  understood: z.string(),
  /** Campos que o classificador extraiu, em código (category: "network_vpn"...). */
  extracted: z.record(z.string(), z.string()),
  classifierConfidence: z.number().min(0).max(1),
  finalConfidence: z.number().min(0).max(1),
  isLowConfidence: z.boolean(),
  reason: z.string(),
  steps: z.array(z.object({ tool: z.string(), ok: z.boolean(), outcome: z.string() })),
  rules: z.array(z.string()),
  signals: z.array(z.object({ code: z.string(), label: z.string(), penalty: z.number() })),
});
export type DecisionView = z.infer<typeof decisionViewSchema>;
