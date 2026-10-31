import { z } from "zod";

/**
 * De onde veio a confiança: o classificador (etapa 1), uma resposta rápida conferida pelo código
 * (R38), um botão (11.5) ou o valor neutro de quando o classificador não respondeu.
 */
export const CONFIDENCE_SOURCES = ["classifier", "quick_answer", "button", "neutral"] as const;
export type ConfidenceSource = (typeof CONFIDENCE_SOURCES)[number];

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
  /** Registros gravados antes deste campo existir vieram do classificador. */
  confidenceSource: z.enum(CONFIDENCE_SOURCES).default("classifier"),
  steps: z.array(
    z.object({
      tool: z.string(),
      ok: z.boolean(),
      outcome: z.string(),
      /** O que a ação recebeu, resumido (a busca feita, o número do chamado). */
      input: z.string().optional(),
      /** De onde veio a resposta (os artigos da central de ajuda). */
      sources: z.array(z.string()).optional(),
    }),
  ),
  rules: z.array(z.string()),
  signals: z.array(z.object({ code: z.string(), label: z.string(), penalty: z.number() })),
});
export type DecisionView = z.infer<typeof decisionViewSchema>;
