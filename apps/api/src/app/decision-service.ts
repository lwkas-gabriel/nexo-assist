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
import type { HandoffService } from "./handoff-service.ts";

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
 * Registro de decisão de cada turno (RF05) e o limiar de confiança (R39): com confiança baixa, o
 * agent pergunta; se a mensagem seguinte também chegar com confiança baixa, o código transfere para
 * um analista antes de o agent falar. Assim o funcionário não recebe uma pergunta que ninguém vai
 * acompanhar, e o turno não gasta uma chamada ao modelo.
 */
export function createDecisionService({
  decisionStore,
  handoffService,
  clock,
}: DecisionServiceDependencies) {
  async function save(outcome: TurnOutcome, trace: DecisionTrace) {
    const now = clock.now();
    await decisionStore.create({
      messageId: outcome.messageId,
      conversationId: outcome.conversationId,
      trace,
      classifierTokens: outcome.classification.ok ? (outcome.classification.tokens ?? null) : null,
      latencyMs: now.getTime() - outcome.startedAt.getTime(),
      createdAt: now,
    });
  }

  return {
    async record(outcome: TurnOutcome): Promise<DecisionTrace> {
      const trace = buildDecisionTrace(outcome.classification, outcome.response);
      await save(outcome, trace);
      return trace;
    },

    /**
     * R39: segunda mensagem seguida com confiança baixa vai para um analista, sem o agent.
     * Devolve o aviso que o funcionário recebe, ou null se o agent deve responder normalmente.
     */
    async escalateLowConfidence(turn: Omit<TurnOutcome, "messageId" | "response">) {
      const { classification } = turn.classification;
      if (classification.confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
      const previous = await decisionStore.latestConfidence(turn.conversationId);
      if (previous === undefined || previous >= LOW_CONFIDENCE_THRESHOLD) return null;

      let transfer: Awaited<ReturnType<HandoffService["transfer"]>>;
      try {
        transfer = await handoffService.transfer({
          employeeId: turn.employeeId,
          conversationId: turn.conversationId,
          reason: "low_confidence",
          summary: {
            problem: classification.understood,
            attempted:
              "O agent pediu esclarecimento, mas a mensagem seguinte continuou sem deixar claro o que fazer.",
          },
        });
      } catch (error) {
        // Outra ação já tirou a conversa do agent: o turno segue como pausa.
        if (error instanceof AppError && error.code === "CONFLICT") return null;
        throw error;
      }

      const response: UIMessage = {
        id: transfer.notice.id,
        role: "assistant",
        parts: [{ type: "text", text: transfer.notice.text }],
      };
      const trace = buildDecisionTrace(turn.classification, response, {
        steps: [
          { tool: "handoff_to_analyst", ok: true, outcome: "transferência feita pelo código" },
        ],
        rules: [
          "R39: confiança baixa em duas mensagens seguidas → analista",
          `A03: ${transfer.view.reason} → Suporte ${transfer.view.supportLevel}`,
        ],
      });
      await save({ ...turn, messageId: transfer.notice.id, response }, trace);
      return { notice: transfer.notice.text, handoff: transfer.view };
    },

    /** Registros das respostas do agent, para a tela mostrar o detalhe da decisão. */
    forMessages(messageIds: string[]) {
      return decisionStore.byMessage(messageIds);
    },
  };
}

export type DecisionService = ReturnType<typeof createDecisionService>;
