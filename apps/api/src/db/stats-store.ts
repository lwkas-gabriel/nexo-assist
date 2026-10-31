import { and, avg, countDistinct, eq, gt, gte, isNotNull } from "drizzle-orm";
import type { Database } from "./database.ts";
import { authSessions, decisionTraces, handoffs, users } from "./schema.ts";

/** Consultas agregadas para os números da tela de login (A11). Nenhum dado de pessoa sai daqui. */
export function createStatsStore(db: Database) {
  return {
    /** Latência média dos turnos que chamaram o modelo, a partir de `since`. */
    async averageAgentLatencyMs(since: Date): Promise<number | null> {
      const [row] = await db
        .select({ value: avg(decisionTraces.latencyMs) })
        .from(decisionTraces)
        .where(and(isNotNull(decisionTraces.agentTokens), gte(decisionTraces.createdAt, since)));
      return row?.value === null || row?.value === undefined ? null : Number(row.value);
    },

    /** Conversas com pelo menos um turno do agent, e quantas delas foram para um analista. */
    async conversationsSince(since: Date): Promise<{ withAgent: number; handedOff: number }> {
      const [agent] = await db
        .select({ value: countDistinct(decisionTraces.conversationId) })
        .from(decisionTraces)
        .where(gte(decisionTraces.createdAt, since));
      const [handed] = await db
        .select({ value: countDistinct(handoffs.conversationId) })
        .from(handoffs)
        .where(gte(handoffs.createdAt, since));
      return { withAgent: agent?.value ?? 0, handedOff: handed?.value ?? 0 };
    },

    /** Analistas com sessão de login válida agora. */
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
