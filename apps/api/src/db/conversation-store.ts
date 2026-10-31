import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, gte, ne } from "drizzle-orm";
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
  version: number;
  assignedAnalystId: string | null;
  analystReadAt: Date | null;
  updatedAt: Date;
  employee: { id: string; name: string; department: string; lastSeenAt: Date | null };
};

export type NewMessage = {
  /** Id já usado na tela (bolha otimista ou stream); sem ele, o servidor gera um. */
  id?: string;
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

    /** Uma mensagem desta conversa pelo id (para reconhecer um reenvio depois de uma falha). */
    async findMessage(conversationId: string, id: string): Promise<MessageRow | undefined> {
      const [row] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.id, id)))
        .limit(1);
      return row;
    },

    /** Grava uma mensagem (com o id sugerido, se livre) e atualiza a data da conversa. */
    async appendMessage(message: NewMessage): Promise<MessageRow> {
      const values = { ...message, parts: JSON.stringify(message.parts) };
      // O id sugerido só vale se estiver livre; repetido (retry, colisão), o servidor gera outro.
      const [suggested] = message.id
        ? await db
            .insert(messages)
            .values({ ...values, id: message.id })
            .onConflictDoNothing()
            .returning()
        : [];
      const [row] = suggested
        ? [suggested]
        : await db
            .insert(messages)
            .values({ ...values, id: randomUUID() })
            .returning();
      if (!row) throw new Error("Falha ao gravar a mensagem");
      await db
        .update(conversations)
        .set({ updatedAt: message.createdAt })
        .where(eq(conversations.id, message.conversationId));
      return row;
    },
    /** Um analista abriu a conversa no console: as mensagens até aqui deixam de ser não lidas. */
    async markReadByAnalyst(conversationId: string, at: Date): Promise<void> {
      await db
        .update(conversations)
        .set({ analystReadAt: at })
        .where(eq(conversations.id, conversationId));
    },

    /** Mensagens do funcionário depois de `since` (todas, sem `since`): as não lidas do console. */
    async countEmployeeMessagesSince(conversationId: string, since: Date | null): Promise<number> {
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.author, "employee"),
            since ? gt(messages.createdAt, since) : undefined,
          ),
        );
      return rows.length;
    },

    /** Conversas em andamento, das mais recentes às mais antigas, com quem está conversando. */
    async listOpenForConsole(): Promise<ConsoleConversationSummary[]> {
      const rows = await db
        .select({
          id: conversations.id,
          mode: conversations.mode,
          version: conversations.version,
          assignedAnalystId: conversations.assignedAnalystId,
          analystReadAt: conversations.analystReadAt,
          updatedAt: conversations.updatedAt,
          employee: {
            id: users.id,
            name: users.name,
            department: users.department,
            lastSeenAt: users.lastSeenAt,
          },
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
