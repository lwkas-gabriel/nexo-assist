import { desc, eq, inArray } from "drizzle-orm";
import type { DecisionTrace } from "../agent/decision-trace.ts";
import type { Database } from "./database.ts";
import { decisionTraces } from "./schema.ts";

export type NewDecision = {
  messageId: string;
  conversationId: string;
  trace: DecisionTrace;
  classifierTokens: number | null;
  latencyMs: number;
  createdAt: Date;
};

export function createDecisionStore(db: Database) {
  return {
    async create(decision: NewDecision): Promise<void> {
      await db.insert(decisionTraces).values({
        ...decision,
        trace: JSON.stringify(decision.trace),
        finalConfidence: decision.trace.finalConfidence,
      });
    },

    /** Confiança final do turno mais recente da conversa (R39). */
    async latestConfidence(conversationId: string) {
      const row = await db.query.decisionTraces.findFirst({
        where: eq(decisionTraces.conversationId, conversationId),
        orderBy: desc(decisionTraces.createdAt),
      });
      return row?.finalConfidence;
    },

    /** Registros das mensagens pedidas, por id da mensagem (para a tela mostrar o detalhe). */
    async byMessage(messageIds: string[]): Promise<Map<string, DecisionTrace>> {
      if (messageIds.length === 0) return new Map();
      const rows = await db.query.decisionTraces.findMany({
        where: inArray(decisionTraces.messageId, messageIds),
      });
      return new Map(rows.map((row) => [row.messageId, JSON.parse(row.trace) as DecisionTrace]));
    },
  };
}

export type DecisionStore = ReturnType<typeof createDecisionStore>;
