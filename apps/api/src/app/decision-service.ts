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
  /** Versão da conversa no turno: muda a cada transferência ou devolução. */
  conversationVersion: number;
  /** A resposta do agent, já gravada. */
  messageId: string;
  response: UIMessage;
  classification: ClassificationResult;
  startedAt: Date;
};

/** O que o turno faz depois da etapa 1: o agent responde, o código transfere ou a conversa já saiu do agent. */
export type TurnRoute =
  { kind: "agent" } | { kind: "escalated"; notice: string } | { kind: "paused" };

const isLow = (confidence: number) => confidence < LOW_CONFIDENCE_THRESHOLD;

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
      conversationVersion: outcome.conversationVersion,
      trace,
      classifierTokens: outcome.classification.ok ? (outcome.classification.tokens ?? null) : null,
      latencyMs: now.getTime() - outcome.startedAt.getTime(),
      createdAt: now,
    });
  }

  /** O registro não pode derrubar a resposta, que já foi dada (ou o aviso, já gravado). */
  async function saveSafely(outcome: TurnOutcome, trace: DecisionTrace) {
    try {
      await save(outcome, trace);
    } catch (error) {
      console.error("Falha ao gravar o registro de decisão do turno", error);
    }
  }

  return {
    async record(outcome: TurnOutcome): Promise<DecisionTrace> {
      const trace = buildDecisionTrace(outcome.classification, outcome.response);
      await saveSafely(outcome, trace);
      return trace;
    },

    /**
     * Botão da tela (confirmar, cancelar, editar): ação determinística, sem LLM, com confiança 100%
     * (11.5, ADR-0006). Conta como turno para o limiar: um clique no meio zera a sequência.
     */
    async recordButtonAction(action: {
      conversationId: string;
      conversationVersion: number;
      messageId: string;
      description: string;
      at: Date;
    }) {
      const classification: ClassificationResult = {
        ok: true,
        tokens: undefined,
        classification: {
          intent: "confirm_draft",
          understood: action.description,
          extracted: {},
          confidence: 1,
          reason: "Ação pelo botão do card: determinística, sem passar pelo LLM.",
        },
      };
      const response: UIMessage = {
        id: action.messageId,
        role: "assistant",
        parts: [{ type: "text", text: action.description }],
      };
      const trace = buildDecisionTrace(classification, response, {
        steps: [{ tool: "draft_button", ok: true, outcome: action.description }],
        rules: ["11.5: ação do card tratada pelo código, sem o LLM"],
      });
      await saveSafely(
        {
          employeeId: "",
          conversationId: action.conversationId,
          conversationVersion: action.conversationVersion,
          messageId: action.messageId,
          response,
          classification,
          startedAt: action.at,
        },
        trace,
      );
    },

    /**
     * R39: depois da etapa 1, decide quem responde. Segunda mensagem seguida com o classificador
     * em confiança baixa (a mesma medida que o agent recebe, no mesmo período com o agent) vai
     * para um analista, sem o agent.
     */
    async routeTurn(turn: Omit<TurnOutcome, "messageId" | "response">): Promise<TurnRoute> {
      const { classification } = turn.classification;
      if (!turn.classification.ok || !isLow(classification.confidence)) return { kind: "agent" };
      const previous = await decisionStore.previousClassifierConfidence(
        turn.conversationId,
        turn.conversationVersion,
      );
      if (previous === undefined || !isLow(previous)) return { kind: "agent" };

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
        // Outra ação já tirou a conversa do agent: a mensagem fica para o analista (RN08).
        if (error instanceof AppError && error.code === "CONFLICT") return { kind: "paused" };
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
      await saveSafely({ ...turn, messageId: transfer.notice.id, response }, trace);
      return { kind: "escalated", notice: transfer.notice.text };
    },

    /** Registros das respostas do agent, para a tela mostrar o detalhe da decisão. */
    forMessages(messageIds: string[]) {
      return decisionStore.byMessage(messageIds);
    },
  };
}

export type DecisionService = ReturnType<typeof createDecisionService>;
