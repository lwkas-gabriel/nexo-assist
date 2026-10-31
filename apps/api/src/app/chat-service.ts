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
import {
  INTENT_LABELS,
  type ClassificationResult,
  type Classifier,
  type TranscriptLine,
} from "../agent/classifier.ts";
import { LOW_CONFIDENCE_THRESHOLD } from "../agent/decision-trace.ts";
import { NEXO_AGENT_ID } from "../agent/nexo-agent.ts";
import { agentMayReply } from "./conversation-state.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { ConversationRow, MessageRow, UserRow } from "../db/schema.ts";
import type { DecisionService } from "./decision-service.ts";
import type { DraftService } from "./draft-service.ts";

/** Quantas mensagens recentes o agent recebe: contexto suficiente, custo controlado (RT10). */
const HISTORY_WINDOW = 40;
/** Quantas mensagens anteriores o classificador vê: só o bastante para entender a nova. */
const CLASSIFIER_CONTEXT = 6;

type ChatServiceDependencies = {
  mastra: Mastra;
  conversationStore: ConversationStore;
  draftService: DraftService;
  classifier: Classifier;
  decisionService: DecisionService;
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
  classifier,
  decisionService,
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

  /** O registro de decisão não pode derrubar a resposta, que já chegou ao funcionário. */
  async function recordDecision(outcome: Parameters<DecisionService["record"]>[0]) {
    try {
      await decisionService.record(outcome);
    } catch (error) {
      console.error("Falha ao gravar o registro de decisão do turno", error);
    }
  }

  return {
    /** Se a próxima mensagem vai para o agent (e gasta o modelo) ou fica para o analista (RN08). */
    async agentWillReply(employee: UserRow): Promise<boolean> {
      const conversation = await conversationStore.findOpenByEmployee(employee.id);
      // Sem conversa aberta, a próxima mensagem abre uma nova, com o agent.
      return !conversation || agentMayReply(conversation.mode);
    },

    /** A conversa como a tela mostra, com o registro de decisão de cada resposta do agent (RF05). */
    async getConversation(employee: UserRow): Promise<ConversationView> {
      const conversation = await conversationStore.findOpenByEmployee(employee.id);
      if (!conversation) return { conversation: null, messages: [] };
      const messages = await loadHistory(conversation.id, toUIMessage);
      const decisions = await decisionService.forMessages(messages.map((message) => message.id));
      return {
        conversation: { id: conversation.id, mode: conversation.mode },
        messages: messages.map((message) => {
          const decision = decisions.get(message.id);
          return decision
            ? { ...message, metadata: { ...authorMetadata(message), decision } }
            : message;
        }),
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
        // Etapa 1 (R05): o classificador vê a mensagem nova e um pouco do que veio antes.
        const previous = await conversationStore.listRecentMessages(
          conversation.id,
          CLASSIFIER_CONTEXT,
        );
        const classification = await classifier.classify(previous.map(toTranscriptLine), text);
        await conversationStore.appendMessage({
          conversationId: conversation.id,
          author: "employee",
          authorId: employee.id,
          parts: [{ type: "text", text }],
          createdAt: turnStartedAt,
        });
        // R39: segunda mensagem seguida sem dar para entender vai para um analista, sem o agent.
        const escalation = await decisionService.escalateLowConfidence({
          employeeId: employee.id,
          conversationId: conversation.id,
          classification,
          startedAt: turnStartedAt,
        });
        if (escalation) {
          release();
          return systemNoticeStream(escalation.notice);
        }

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
            // Etapa 2: o agent recebe a classificação como contexto do sistema, não da conversa.
            system: describeClassification(classification),
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
                const saved = await conversationStore.appendMessage({
                  conversationId: conversation.id,
                  author: "agent",
                  authorId: null,
                  parts: responseMessage.parts,
                  createdAt: clock.now(),
                });
                // R04: só o rascunho que a resposta gravada mostra ("D-12") conta como visto.
                await draftService.markShownInReply(conversation.id, textOf(responseMessage));
                await recordDecision({
                  employeeId: employee.id,
                  conversationId: conversation.id,
                  messageId: saved.id,
                  response: responseMessage,
                  classification,
                  startedAt: turnStartedAt,
                });
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

/** Resposta sem o agent: o aviso do sistema, no mesmo formato de stream que a tela já lê. */
function systemNoticeStream(text: string): ReadableStream<UIMessageChunk> {
  return createUIMessageStream({
    execute: ({ writer }) => {
      const id = "system-notice";
      writer.write({ type: "start", messageMetadata: { author: "system" } });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
}

const SPEAKERS: Record<MessageRow["author"], TranscriptLine["speaker"]> = {
  employee: "Funcionário",
  agent: "Nexo Assist",
  analyst: "Analista",
  system: "Sistema",
};

function toTranscriptLine(row: MessageRow): TranscriptLine {
  return { speaker: SPEAKERS[row.author], text: textOf(toUIMessage(row)) };
}

/** A classificação da etapa 1 como o agent a recebe (R05). */
function describeClassification({ classification }: ClassificationResult): string {
  const level = classification.confidence < LOW_CONFIDENCE_THRESHOLD ? "baixa" : "alta";
  return `Classificação da mensagem atual, feita antes de você (etapa 1): intenção "${INTENT_LABELS[classification.intent]}"; entendido: "${classification.understood}"; confiança ${level} (${classification.confidence}).`;
}

function authorMetadata(message: UIMessage): Record<string, unknown> {
  return typeof message.metadata === "object" && message.metadata !== null
    ? { ...message.metadata }
    : {};
}

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
export function toAgentHistoryMessage(row: MessageRow): UIMessage {
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
