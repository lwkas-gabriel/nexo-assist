import { and, avg, countDistinct, eq, gt, gte, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "./database.ts";
import { authSessions, decisionTraces, handoffs, users } from "./schema.ts";

/** Consultas agregadas para os números da tela de login (A11). Nenhum dado de pessoa sai daqui. */
export function createStatsStore(db: Database) {
  /** Conversas com pelo menos um turno do agent registrado na janela. */
  const conversationsWithAgent = (since: Date) =>
    db
      .selectDistinct({ id: decisionTraces.conversationId })
      .from(decisionTraces)
      .where(gte(decisionTraces.createdAt, since));

  return {
    /**
     * Duração média dos turnos que chamaram o modelo (da mensagem ao fim da resposta), a partir de
     * `since`. Turnos que falharam sem informar tokens ficam de fora.
     */
    async averageAgentLatencyMs(since: Date): Promise<number | null> {
      const [row] = await db
        .select({ value: avg(decisionTraces.latencyMs) })
        .from(decisionTraces)
        .where(and(isNotNull(decisionTraces.agentTokens), gte(decisionTraces.createdAt, since)));
      return row?.value === null || row?.value === undefined ? null : Number(row.value);
    },

    /**
     * Conversas atendidas pelo agent na janela e, entre elas mesmas, quantas foram para um
     * analista: o numerador vem do mesmo conjunto que o denominador.
     */
    async conversationsSince(since: Date): Promise<{ withAgent: number; handedOff: number }> {
      const [agent] = await db
        .select({ value: countDistinct(decisionTraces.conversationId) })
        .from(decisionTraces)
        .where(gte(decisionTraces.createdAt, since));
      const [handed] = await db
        .select({ value: countDistinct(handoffs.conversationId) })
        .from(handoffs)
        .where(inArray(handoffs.conversationId, conversationsWithAgent(since)));
      return { withAgent: agent?.value ?? 0, handedOff: handed?.value ?? 0 };
    },

    /** Analistas com sessão de login ainda válida. */
    async analystsSignedIn(now: Date): Promise<number> {
      const [row] = await db
        .select({ value: countDistinct(authSessions.userId) })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(and(eq(users.role, "analyst"), gt(authSessions.expiresAt, now)));
      return row?.value ?? 0;
    },
  };
}

export type StatsStore = ReturnType<typeof createStatsStore>;
