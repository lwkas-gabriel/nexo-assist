import { desc, eq } from "drizzle-orm";
import type { Database } from "./database.ts";
import { handoffs, type HandoffRow } from "./schema.ts";

export type NewHandoff = typeof handoffs.$inferInsert;

export function createHandoffStore(db: Database) {
  return {
    async create(handoff: NewHandoff): Promise<HandoffRow> {
      const [row] = await db.insert(handoffs).values(handoff).returning();
      if (!row) throw new Error("Falha ao gravar a transferência");
      return row;
    },

    async markTicketTransferred(id: string): Promise<HandoffRow> {
      const [row] = await db
        .update(handoffs)
        .set({ ticketTransferred: true })
        .where(eq(handoffs.id, id))
        .returning();
      if (!row) throw new Error(`Transferência ${id} sumiu`);
      return row;
    },

    /** A transferência mais recente da conversa: o resumo que o analista lê ao abrir o caso. */
    async latestForConversation(conversationId: string): Promise<HandoffRow | undefined> {
      return db.query.handoffs.findFirst({
        where: eq(handoffs.conversationId, conversationId),
        orderBy: desc(handoffs.createdAt),
      });
    },
  };
}

export type HandoffStore = ReturnType<typeof createHandoffStore>;
