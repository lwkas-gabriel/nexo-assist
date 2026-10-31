import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./database.ts";
import { chatSessions, type ChatSessionRow, type SessionEndReason } from "./schema.ts";

export function createChatSessionStore(db: Database) {
  return {
    async findActive(conversationId: string): Promise<ChatSessionRow | undefined> {
      return db.query.chatSessions.findFirst({
        where: and(
          eq(chatSessions.conversationId, conversationId),
          eq(chatSessions.status, "active"),
        ),
      });
    },

    /** A sessão encerrada mais recente: o resumo dela abre a sessão atual (R03). */
    async latestEnded(conversationId: string): Promise<ChatSessionRow | undefined> {
      return db.query.chatSessions.findFirst({
        where: and(
          eq(chatSessions.conversationId, conversationId),
          eq(chatSessions.status, "ended"),
        ),
        orderBy: desc(chatSessions.endedAt),
      });
    },

    async start(conversationId: string, now: Date): Promise<ChatSessionRow> {
      const [row] = await db
        .insert(chatSessions)
        .values({
          id: randomUUID(),
          conversationId,
          status: "active",
          startedAt: now,
          lastActivityAt: now,
        })
        .returning();
      if (!row) throw new Error("Falha ao abrir a sessão");
      return row;
    },

    /** Encerra só se ainda estiver ativa: duas abas não encerram a mesma sessão duas vezes. */
    async end(id: string, reason: SessionEndReason, summary: string, now: Date) {
      const [row] = await db
        .update(chatSessions)
        .set({ status: "ended", endedReason: reason, summary, endedAt: now })
        .where(and(eq(chatSessions.id, id), eq(chatSessions.status, "active")))
        .returning();
      return row;
    },

    /**
     * Conta uma mensagem ao agent, num UPDATE condicional ao limite: duas mensagens simultâneas
     * não passam juntas da 30ª (RN14). Devolve undefined se a sessão já chegou ao limite.
     */
    async countAgentMessage(id: string, limit: number, now: Date) {
      const [row] = await db
        .update(chatSessions)
        .set({ agentMessages: sql`${chatSessions.agentMessages} + 1`, lastActivityAt: now })
        .where(
          and(
            eq(chatSessions.id, id),
            eq(chatSessions.status, "active"),
            lt(chatSessions.agentMessages, limit),
          ),
        )
        .returning();
      return row;
    },

    /** Atividade sem o agent (mensagem para o analista): mantém a sessão viva, sem contar (R42). */
    async touch(id: string, now: Date): Promise<void> {
      await db.update(chatSessions).set({ lastActivityAt: now }).where(eq(chatSessions.id, id));
    },
  };
}

export type ChatSessionStore = ReturnType<typeof createChatSessionStore>;
