import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { UIMessage } from "ai";
import type { ClassificationResult } from "../agent/classifier.ts";
import {
  LOW_CONFIDENCE_THRESHOLD,
  buildDecisionTrace,
  type DecisionTrace,
} from "../agent/decision-trace.ts";
import type { DecisionStore } from "../db/decision-store.ts";
import type { HandoffService, HandoffView } from "./handoff-service.ts";

type DecisionServiceDependencies = {
  decisionStore: DecisionStore;
  handoffService: HandoffService;
  clock: Clock;
};

export type TurnOutcome = {
  employeeId: string;
  conversationId: string;
  /** A resposta do agent, já gravada. */
  messageId: string;
  response: UIMessage;
  classification: ClassificationResult;
  startedAt: Date;
};

/**
 * Registro de decisão de cada turno (RF05) e o limiar de confiança (R39): confiança baixa leva o
 * agent a perguntar; se continuar baixa no turno seguinte, o código transfere para um analista,
 * sem depender de o agent decidir isso.
 */
export function createDecisionService({
  decisionStore,
  handoffService,
  clock,
}: DecisionServiceDependencies) {
  /** Dois turnos seguidos com confiança baixa, sem o agent já ter transferido neste turno. */
  async function shouldHandoff(outcome: TurnOutcome, trace: DecisionTrace) {
    if (!trace.isLowConfidence) return false;
    if (trace.steps.some((step) => step.tool === "handoff_to_analyst" && step.ok)) return false;
    const previous = await decisionStore.previousConfidence(
      outcome.conversationId,
      outcome.messageId,
    );
    return previous !== undefined && previous < LOW_CONFIDENCE_THRESHOLD;
  }

  return {
    async record(
      outcome: TurnOutcome,
    ): Promise<{ trace: DecisionTrace; handoff: HandoffView | null }> {
      const trace = buildDecisionTrace(outcome.classification, outcome.response);
      const now = clock.now();
      await decisionStore.create({
        messageId: outcome.messageId,
        conversationId: outcome.conversationId,
        trace,
        classifierTokens: outcome.classification.ok
          ? (outcome.classification.tokens ?? null)
          : null,
        latencyMs: now.getTime() - outcome.startedAt.getTime(),
        createdAt: now,
      });

      if (!(await shouldHandoff(outcome, trace))) return { trace, handoff: null };
      try {
        const handoff = await handoffService.handoff({
          employeeId: outcome.employeeId,
          conversationId: outcome.conversationId,
          reason: "low_confidence",
          summary: {
            problem: trace.understood,
            attempted: "O agent pediu esclarecimento, mas continuou sem segurança para resolver.",
          },
        });
        return { trace, handoff };
      } catch (error) {
        // A conversa já saiu do agent neste turno (por exemplo, um chamado crítico confirmado).
        if (error instanceof AppError && error.code === "CONFLICT") return { trace, handoff: null };
        throw error;
      }
    },

    /** Registros das respostas do agent, para a tela mostrar o detalhe da decisão. */
    forMessages(messageIds: string[]) {
      return decisionStore.byMessage(messageIds);
    },
  };
}

export type DecisionService = ReturnType<typeof createDecisionService>;
