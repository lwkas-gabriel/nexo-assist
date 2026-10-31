import type { Mastra } from "@mastra/core/mastra";
import { handleChatStream } from "@mastra/ai-sdk";
import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import {
  createUIMessageStream,
  safeValidateUIMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { createAgentRequestContext } from "../agent/agent-context.ts";
import { describeAgentError } from "../agent/agent-errors.ts";
import { NEXO_AGENT_ID } from "../agent/nexo-agent.ts";
import { agentMayReply } from "./conversation-state.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { ConversationRow, MessageRow, UserRow } from "../db/schema.ts";
import type { DraftService } from "./draft-service.ts";

/** Quantas mensagens recentes o agent recebe: contexto suficiente, custo controlado (RT10). */
const HISTORY_WINDOW = 40;

type ChatServiceDependencies = {
  mastra: Mastra;
  conversationStore: ConversationStore;
  draftService: DraftService;
  clock: Clock;
};

export type ConversationView = {
  conversation: Pick<ConversationRow, "id" | "mode"> | null;
  messages: UIMessage[];
};

/**
 * Conversa do funcionário com o agent. O histórico vive no banco (fonte da verdade, RT06):
 * o navegador manda só o texto novo, então não há como forjar mensagens anteriores.
 */
export function createChatService({
  mastra,
  conversationStore,
  draftService,
  clock,
}: ChatServiceDependencies) {
  /** Conversas com um turno do agent em andamento: um turno por vez em cada conversa (R06). */
  const busyConversations = new Set<string>();

  async function openConversationFor(employee: UserRow): Promise<ConversationRow> {
    return (
      (await conversationStore.findOpenByEmployee(employee.id)) ??
      (await conversationStore.create(employee.id, clock.now()))
    );
  }

  async function loadHistory(
    conversationId: string,
    toMessage: (row: MessageRow) => UIMessage,
  ): Promise<UIMessage[]> {
    const rows = await conversationStore.listRecentMessages(conversationId, HISTORY_WINDOW);
    const result = await safeValidateUIMessages({ messages: rows.map(toMessage) });
    if (!result.success) {
      throw new AppError("INTERNAL", "Histórico da conversa ilegível.");
    }
    return result.data;
  }

  return {
    async getConversation(employee: UserRow): Promise<ConversationView> {
      const conversation = await conversationStore.findOpenByEmployee(employee.id);
      if (!conversation) return { conversation: null, messages: [] };
      return {
        conversation: { id: conversation.id, mode: conversation.mode },
        messages: await loadHistory(conversation.id, toUIMessage),
      };
    },

    /**
     * Grava a mensagem do funcionário e devolve a resposta do agent em streaming. Com a conversa
     * transferida ou com um analista, o agent nem é chamado (RN08): a mensagem fica para o analista.
     */
    async sendMessage(employee: UserRow, text: string): Promise<ReadableStream<UIMessageChunk>> {
      const conversation = await openConversationFor(employee);
      if (!agentMayReply(conversation.mode)) {
        await conversationStore.appendMessage({
          conversationId: conversation.id,
          author: "employee",
          authorId: employee.id,
          parts: [{ type: "text", text }],
          createdAt: clock.now(),
        });
        return createUIMessageStream({ execute: () => undefined });
      }
      if (busyConversations.has(conversation.id)) {
        throw new AppError("CONFLICT", "Aguarde a resposta anterior do Nexo Assist.");
      }
      busyConversations.add(conversation.id);
      const release = () => busyConversations.delete(conversation.id);

      try {
        const turnStartedAt = clock.now();
        await conversationStore.appendMessage({
          conversationId: conversation.id,
          author: "employee",
          authorId: employee.id,
          parts: [{ type: "text", text }],
          createdAt: turnStartedAt,
        });
        const history = await loadHistory(conversation.id, toAgentHistoryMessage);
        // O Mastra tipa o stream de forma genérica; no formato v7 ele produz os chunks de UI do AI SDK.
        const agentStream = (await handleChatStream({
          mastra,
          agentId: NEXO_AGENT_ID,
          version: "v7",
          // O funcionário vem da sessão: as tools só consultam os chamados dele (RN09).
          // O início do turno separa o rascunho que ele já viu do que o agent acabou de propor (R04).
          params: {
            messages: history,
            requestContext: createAgentRequestContext({
              employeeId: employee.id,
              conversationId: conversation.id,
              startedAt: turnStartedAt,
            }),
          },
          // O erro original (provedor, stack trace) fica no log; o funcionário vê uma mensagem amigável.
          onError: (error) => {
            // Pode ser o modelo ou uma tool que falhou sem tratamento: o erro registrado diz qual.
            console.error("Falha no turno do agent", error);
            return describeAgentError(error);
          },
        })) as ReadableStream<UIMessageChunk>;

        return createUIMessageStream({
          execute: ({ writer }) => writer.merge(agentStream),
          onError: describeAgentError,
          onFinish: async ({ responseMessage }) => {
            try {
              if (responseMessage.parts.length > 0) {
                await conversationStore.appendMessage({
                  conversationId: conversation.id,
                  author: "agent",
                  authorId: null,
                  parts: responseMessage.parts,
                  createdAt: clock.now(),
                });
                // R04: só o rascunho que a resposta gravada mostra ("D-12") conta como visto.
                await draftService.markShownInReply(conversation.id, textOf(responseMessage));
              }
            } finally {
              release();
            }
          },
        });
      } catch (error) {
        release();
        throw error;
      }
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;

function textOf(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ");
}

/** Mensagem como a tela mostra; o autor vai junto, para a tela distinguir agent, analista e sistema. */
function toUIMessage(row: MessageRow): UIMessage {
  return {
    id: row.id,
    role: row.author === "employee" ? "user" : "assistant",
    metadata: { author: row.author },
    parts: JSON.parse(row.parts) as UIMessage["parts"],
  };
}

/** Como o agent identifica o que não foi ele que escreveu (R18). */
const AUTHOR_PREFIXES: Partial<Record<MessageRow["author"], string>> = {
  analyst: "[Mensagem do analista] ",
  system: "[Registro do sistema] ",
};

/**
 * Mensagem como o agent recebe no histórico. Mensagens do analista e registros do sistema chegam
 * marcadas: sem isso, o modelo as tomaria como respostas dele mesmo (R18).
 */
function toAgentHistoryMessage(row: MessageRow): UIMessage {
  const message = toUIMessage(row);
  const prefix = AUTHOR_PREFIXES[row.author];
  if (!prefix) return message;
  return {
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text" ? { ...part, text: `${prefix}${part.text}` } : part,
    ),
  };
}
