import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import type { Database } from "./database.ts";
import {
  conversations,
  messages,
  type ConversationRow,
  type MessageAuthor,
  type MessageRow,
} from "./schema.ts";

export type NewMessage = {
  conversationId: string;
  author: MessageAuthor;
  authorId: string | null;
  /** Partes da mensagem no formato do AI SDK (texto, ações do agent). */
  parts: unknown[];
  createdAt: Date;
};

export function createConversationStore(db: Database) {
  return {
    /** Conversa em andamento do funcionário (qualquer uma que não esteja encerrada). */
    async findOpenByEmployee(employeeId: string): Promise<ConversationRow | undefined> {
      return db.query.conversations.findFirst({
        where: and(eq(conversations.employeeId, employeeId), ne(conversations.mode, "closed")),
        orderBy: desc(conversations.createdAt),
      });
    },

    async create(employeeId: string, now: Date): Promise<ConversationRow> {
      const [row] = await db
        .insert(conversations)
        .values({ id: randomUUID(), employeeId, mode: "agent", createdAt: now, updatedAt: now })
        .returning();
      if (!row) throw new Error("Falha ao criar a conversa");
      return row;
    },

    /** Grava uma mensagem com id gerado pelo servidor e atualiza a data da conversa. */
    async appendMessage(message: NewMessage): Promise<MessageRow> {
      const [row] = await db
        .insert(messages)
        .values({ ...message, id: randomUUID(), parts: JSON.stringify(message.parts) })
        .returning();
      if (!row) throw new Error("Falha ao gravar a mensagem");
      await db
        .update(conversations)
        .set({ updatedAt: message.createdAt })
        .where(eq(conversations.id, message.conversationId));
      return row;
    },

    /** As últimas `limit` mensagens, da mais antiga para a mais nova. */
    async listRecentMessages(conversationId: string, limit: number): Promise<MessageRow[]> {
      const newestFirst = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: desc(messages.createdAt),
        limit,
      });
      return newestFirst.reverse();
    },
  };
}

export type ConversationStore = ReturnType<typeof createConversationStore>;
