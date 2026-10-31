import { AppError } from "@nexo/shared/errors";
import { safeValidateUIMessages, type UIMessage } from "ai";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { MessageRow } from "../db/schema.ts";
import type { UserStore } from "../db/user-store.ts";
import type { DecisionService } from "./decision-service.ts";

/** Quem atende, como o funcionário e o console veem ("Rafael Lima · Suporte N2"). */
export type AnalystView = { name: string; department: string };

/**
 * Quantas mensagens a tela recebe: bem mais que o agent, para o histórico das sessões anteriores
 * continuar visível (R03, RF11). Uma sessão inteira tem umas 60 mensagens.
 */
export const DISPLAY_WINDOW = 200;

/** Mensagem como a tela mostra; o autor vai junto, para distinguir agent, analista e sistema. */
export function toUIMessage(row: MessageRow): UIMessage {
  return {
    id: row.id,
    role: row.author === "employee" ? "user" : "assistant",
    metadata: { author: row.author, createdAt: row.createdAt.toISOString() },
    parts: JSON.parse(row.parts) as UIMessage["parts"],
  };
}

/** As mensagens de uma conversa, validadas no formato do AI SDK (lista vazia é válida). */
export async function readMessages(
  conversationStore: ConversationStore,
  conversationId: string,
  toMessage: (row: MessageRow) => UIMessage,
  limit: number,
  since?: Date,
): Promise<UIMessage[]> {
  const rows = await conversationStore.listRecentMessages(conversationId, limit, since);
  // O AI SDK recusa validar a lista vazia (conversa cuja primeira mensagem foi recusada).
  if (rows.length === 0) return [];
  const result = await safeValidateUIMessages({ messages: rows.map(toMessage) });
  if (!result.success) {
    throw new AppError("INTERNAL", "Histórico da conversa ilegível.");
  }
  return result.data;
}

function withMetadata(message: UIMessage, extra: Record<string, unknown>): UIMessage {
  const metadata =
    typeof message.metadata === "object" && message.metadata !== null ? message.metadata : {};
  return { ...message, metadata: { ...metadata, ...extra } };
}

/**
 * Conversa como as telas mostram (chat do funcionário e console): cada mensagem com o autor, a
 * data, quem é o analista (R27), o registro de decisão (RF05) e, no console, se o funcionário já
 * viu o que foi mandado para ele (✓/✓✓, A20).
 */
export function createConversationReader({
  conversationStore,
  decisionService,
  userStore,
}: {
  conversationStore: ConversationStore;
  decisionService: DecisionService;
  userStore: UserStore;
}) {
  return {
    /** Os analistas pelo id; só nome e setor saem daqui (nem id, nem e-mail vão para a tela). */
    async analysts(): Promise<Map<string, AnalystView>> {
      return new Map(
        (await userStore.listAnalysts()).map((analyst) => [
          analyst.id,
          { name: analyst.name, department: analyst.department },
        ]),
      );
    },

    async messages(
      conversationId: string,
      analysts: Map<string, AnalystView>,
      options: { employeeSeenAt?: Date | null } = {},
    ): Promise<UIMessage[]> {
      const authors = new Map<string, MessageRow>();
      const messages = await readMessages(
        conversationStore,
        conversationId,
        (row) => {
          authors.set(row.id, row);
          return toUIMessage(row);
        },
        DISPLAY_WINDOW,
      );
      const decisions = await decisionService.forMessages(messages.map((message) => message.id));
      return messages.map((message) => {
        const row = authors.get(message.id);
        const extra: Record<string, unknown> = {};
        const analyst =
          row?.author === "analyst" && row.authorId ? analysts.get(row.authorId) : undefined;
        if (analyst) extra.analyst = analyst;
        const decision = decisions.get(message.id);
        if (decision) extra.decision = decision;
        // Só no console: o que foi para o funcionário (agent ou analista) já foi visto por ele?
        if (
          options.employeeSeenAt !== undefined &&
          (row?.author === "agent" || row?.author === "analyst")
        ) {
          extra.seenByEmployee =
            options.employeeSeenAt !== null && options.employeeSeenAt >= row.createdAt;
        }
        return Object.keys(extra).length > 0 ? withMetadata(message, extra) : message;
      });
    },
  };
}

export type ConversationReader = ReturnType<typeof createConversationReader>;
