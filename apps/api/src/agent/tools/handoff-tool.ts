import { createTool } from "@mastra/core/tools";
import { HANDOFF_REASONS } from "@nexo/shared/domain";
import { z } from "zod";
import type { HandoffService } from "../../app/handoff-service.ts";
import { agentTurnFrom } from "../agent-context.ts";
import { toolFailure } from "./tool-failure.ts";

export const HANDOFF_TO_ANALYST_TOOL_ID = "handoff_to_analyst";

const SUMMARY_MAX_CHARS = 600;

/**
 * Transfere a conversa para um analista (RF16, RN07). O agent escreve o resumo (R17); o nível de
 * suporte, o prazo e a pausa do agent são decididos pelo código. Funcionário e conversa vêm do turno.
 */
export function createHandoffTool({ handoffService }: { handoffService: HandoffService }) {
  return createTool({
    id: HANDOFF_TO_ANALYST_TOOL_ID,
    description:
      "Transfere a conversa para um analista humano, com um resumo do caso. Depois disso você não responde mais nesta conversa até o analista devolvê-la.",
    inputSchema: z.object({
      reason: z
        .enum(HANDOFF_REASONS)
        .describe(
          "employee_request: o funcionário pediu um analista; critical: caso crítico; overdue: chamado com prazo vencido; low_confidence: você não tem segurança para resolver",
        ),
      problem: z
        .string()
        .trim()
        .min(1)
        .max(SUMMARY_MAX_CHARS)
        .describe("O problema, como o analista precisa entender sem reler a conversa"),
      attempted: z
        .string()
        .trim()
        .min(1)
        .max(SUMMARY_MAX_CHARS)
        .describe("O que já foi tentado ou consultado (artigos, chamados), ou 'nada ainda'"),
      ticketNumber: z
        .string()
        .max(40)
        .optional()
        .describe("Número do chamado ligado ao caso, se houver (ex.: INC-20311)"),
    }),
    execute: async ({ reason, problem, attempted, ticketNumber }, context) => {
      const turn = agentTurnFrom(context);
      try {
        const handoff = await handoffService.handoff({
          employeeId: turn.employeeId,
          conversationId: turn.conversationId,
          reason,
          summary: { problem, attempted },
          ...(ticketNumber ? { ticketNumber } : {}),
        });
        return { ok: true as const, handoff };
      } catch (error) {
        return toolFailure(error);
      }
    },
  });
}
