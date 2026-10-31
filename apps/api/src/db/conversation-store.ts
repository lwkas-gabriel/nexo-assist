import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, ne } from "drizzle-orm";
import type { Database } from "./database.ts";
import {
  conversations,
  messages,
  users,
  type ConversationMode,
  type ConversationRow,
  type MessageAuthor,
  type MessageRow,
} from "./schema.ts";

/** Linha da lista de conversas do console do analista. */
export type ConsoleConversationSummary = {
  id: string;
  mode: ConversationMode;
  updatedAt: Date;
  employee: { id: string; name: string; department: string };
};

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

    async findById(id: string): Promise<ConversationRow | undefined> {
      return db.query.conversations.findFirst({ where: eq(conversations.id, id) });
    },

    /**
     * Troca o estado só se a conversa ainda estiver na versão lida (R06): de duas trocas
     * simultâneas (dois analistas assumindo, transferência e devolução juntas), só uma passa.
     */
    async changeMode(
      conversation: Pick<ConversationRow, "id" | "version">,
      change: { mode: ConversationMode; assignedAnalystId: string | null; now: Date },
    ): Promise<ConversationRow | undefined> {
      const [row] = await db
        .update(conversations)
        .set({
          mode: change.mode,
          assignedAnalystId: change.assignedAnalystId,
          version: conversation.version + 1,
          updatedAt: change.now,
        })
        .where(
          and(
            eq(conversations.id, conversation.id),
            eq(conversations.version, conversation.version),
          ),
        )
        .returning();
      return row;
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
    /** Conversas em andamento, das mais recentes às mais antigas, com quem está conversando. */
    async listOpenForConsole(): Promise<ConsoleConversationSummary[]> {
      const rows = await db
        .select({
          id: conversations.id,
          mode: conversations.mode,
          updatedAt: conversations.updatedAt,
          employee: { id: users.id, name: users.name, department: users.department },
        })
        .from(conversations)
        .innerJoin(users, eq(users.id, conversations.employeeId))
        .where(ne(conversations.mode, "closed"))
        .orderBy(desc(conversations.updatedAt));
      return rows;
    },

    /**
     * As últimas `limit` mensagens, da mais antiga para a mais nova. Com `since`, só as a partir
     * dessa data (por exemplo, as da sessão atual).
     */
    async listRecentMessages(
      conversationId: string,
      limit: number,
      since?: Date,
    ): Promise<MessageRow[]> {
      const newestFirst = await db.query.messages.findMany({
        where: since
          ? and(eq(messages.conversationId, conversationId), gte(messages.createdAt, since))
          : eq(messages.conversationId, conversationId),
        orderBy: desc(messages.createdAt),
        limit,
      });
      return newestFirst.reverse();
    },
  };
}

export type ConversationStore = ReturnType<typeof createConversationStore>;
