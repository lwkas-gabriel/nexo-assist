import type { Mastra } from "@mastra/core/mastra";
import { handleChatStream } from "@mastra/ai-sdk";
import { parseTicketNumber, type Clock } from "@nexo/shared/domain";
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
import { toTicketDetails } from "../agent/ticket-view.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { agentMayReply } from "./conversation-state.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { ConversationRow, MessageRow, UserRow } from "../db/schema.ts";
import {
  toSessionView,
  type ChatSessionService,
  type SessionView,
} from "./chat-session-service.ts";
import type { AgentQuota } from "./agent-quota.ts";
import type { DecisionService } from "./decision-service.ts";
import type { DraftService, DraftView } from "./draft-service.ts";
import type { HandoffService } from "./handoff-service.ts";
import { quickAnswerClassification, selectedTicketParts } from "./structured-actions.ts";

/** Quantas mensagens recentes o agent recebe: contexto suficiente, custo controlado (RT10). */
const HISTORY_WINDOW = 40;
/**
 * Quantas mensagens a tela recebe: bem mais que o agent, para o histórico das sessões anteriores
 * continuar visível (R03, RF11). Uma sessão inteira tem umas 60 mensagens.
 */
const DISPLAY_WINDOW = 200;
/**
 * Teto de texto do histórico que o agent recebe. Sem ele, 20 mensagens de 2.000 caracteres,
 * reenviadas a cada passo do agent, chegariam perto dos 250 mil tokens por minuto do plano gratuito.
 */
const HISTORY_MAX_CHARS = 16_000;
/** Quantas mensagens anteriores o classificador vê: só o bastante para entender a nova. */
const CLASSIFIER_CONTEXT = 6;
/** A partir daqui a confiança é alta; entre o limiar e isto, média (como no prompt do classificador). */
const HIGH_CONFIDENCE = 0.8;

type ChatServiceDependencies = {
  mastra: Mastra;
  conversationStore: ConversationStore;
  draftService: DraftService;
  handoffService: HandoffService;
  classifier: Classifier;
  decisionService: DecisionService;
  chatSessionService: ChatSessionService;
  quota: AgentQuota;
  ticketGateway: TicketGateway;
  clock: Clock;
};

export type ConversationView = {
  conversation: Pick<ConversationRow, "id" | "mode"> | null;
  /** RF10: o contador da sessão atual e o resumo da anterior. Nulo antes da primeira mensagem. */
  session: SessionView | null;
  messages: UIMessage[];
  /** Estado atual dos rascunhos da conversa: o card mostra o que aconteceu depois (RF07). */
  drafts: DraftView[];
};

/**
 * Conversa do funcionário com o agent. O histórico vive no banco (fonte da verdade, RT06):
 * o navegador manda só o texto novo, então não há como forjar mensagens anteriores.
 */
export function createChatService({
  mastra,
  conversationStore,
  draftService,
  handoffService,
  classifier,
  decisionService,
  chatSessionService,
  quota,
  ticketGateway,
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

  /**
   * Grava a mensagem do funcionário com o id da bolha da tela. Se a mesma mensagem (id, autor e
   * texto) já está na conversa, é o "Tentar novamente" de uma resposta que falhou depois de a
   * mensagem ser gravada: não duplica. Com id de outra mensagem, grava com um id novo.
   */
  async function saveEmployeeMessage(
    conversationId: string,
    employeeId: string,
    text: string,
    createdAt: Date,
    messageId: string | undefined,
  ): Promise<void> {
    const parts = [{ type: "text", text }];
    const saved = messageId && (await conversationStore.findMessage(conversationId, messageId));
    if (saved && saved.author === "employee" && saved.parts === JSON.stringify(parts)) return;
    await conversationStore.appendMessage({
      ...(messageId ? { id: messageId } : {}),
      conversationId,
      author: "employee",
      authorId: employeeId,
      parts,
      createdAt,
    });
  }

  /** R38: resposta rápida clicada, classificada pelo código (ou undefined, se não confere). */
  async function classifyQuickAnswer(
    previous: MessageRow[],
    answer: string,
  ): Promise<ClassificationResult | undefined> {
    const last = previous.at(-1);
    if (!last) return undefined;
    const asked = (await decisionService.forMessages([last.id])).get(last.id);
    return quickAnswerClassification(toUIMessage(last), asked?.intent, answer);
  }

  /** Histórico da conversa; com `since`, só a partir dessa data (a sessão atual, para o agent). */
  async function loadHistory(
    conversationId: string,
    toMessage: (row: MessageRow) => UIMessage,
    since?: Date,
    limit: number = HISTORY_WINDOW,
  ): Promise<UIMessage[]> {
    const rows = await conversationStore.listRecentMessages(conversationId, limit, since);
    // Conversa sem mensagens (a primeira foi recusada, por exemplo) é válida: o AI SDK recusa a
    // lista vazia, então ela nem passa pela validação.
    if (rows.length === 0) return [];
    const result = await safeValidateUIMessages({ messages: rows.map(toMessage) });
    if (!result.success) {
      throw new AppError("INTERNAL", "Histórico da conversa ilegível.");
    }
    return result.data;
  }

  /** Uma ação por vez em cada conversa (R06): mensagens, nova sessão e pedido de analista. */
  async function withConversationLock<T>(conversationId: string, action: () => Promise<T>) {
    if (busyConversations.has(conversationId)) {
      throw new AppError("CONFLICT", "Aguarde a resposta anterior do Nexo Assist.");
    }
    busyConversations.add(conversationId);
    try {
      return await action();
    } finally {
      busyConversations.delete(conversationId);
    }
  }

  return {
    /** A conversa como a tela mostra, com o registro de decisão de cada resposta do agent (RF05). */
    async getConversation(employee: UserRow): Promise<ConversationView> {
      const conversation = await conversationStore.findOpenByEmployee(employee.id);
      if (!conversation) return { conversation: null, session: null, messages: [], drafts: [] };
      const messages = await loadHistory(conversation.id, toUIMessage, undefined, DISPLAY_WINDOW);
      const decisions = await decisionService.forMessages(messages.map((message) => message.id));
      return {
        conversation: { id: conversation.id, mode: conversation.mode },
        session: await chatSessionService.view(conversation),
        drafts: await draftService.listForConversation(employee.id, conversation.id),
        messages: messages.map((message) => {
          const decision = decisions.get(message.id);
          return decision
            ? { ...message, metadata: { ...authorMetadata(message), decision } }
            : message;
        }),
      };
    },

    /**
     * "Nova sessão" (RN14): encerra a atual com resumo e abre outra na mesma conversa. Passa pela
     * mesma trava das mensagens: não corre junto com um turno nem com outro clique.
     */
    async startNewSession(employee: UserRow): Promise<SessionView> {
      const conversation = await openConversationFor(employee);
      return withConversationLock(conversation.id, async () => {
        const session = await chatSessionService.startNew(conversation);
        return toSessionView(session, await chatSessionService.previousSummary(conversation.id));
      });
    },

    /**
     * "Falar com um analista" pelo botão (11.5): transfere sem passar pelo agent. É o caminho
     * quando a sessão chegou ao limite e a mensagem por texto já não é aceita.
     */
    async requestAnalyst(employee: UserRow) {
      const conversation = await openConversationFor(employee);
      return withConversationLock(conversation.id, async () => {
        const transfer = await handoffService.transfer({
          employeeId: employee.id,
          conversationId: conversation.id,
          reason: "employee_request",
          summary: {
            problem: "O funcionário pediu um analista pelo botão do chat.",
            attempted: await chatSessionService.describeCurrent(conversation),
          },
        });
        const updated = await conversationStore.findById(conversation.id);
        await decisionService.recordButtonAction({
          conversationId: conversation.id,
          conversationVersion: updated?.version ?? conversation.version,
          messageId: transfer.notice.id,
          description: "Funcionário pediu um analista pelo botão.",
          at: clock.now(),
          intent: "talk_to_analyst",
          step: "analyst_button",
        });
        return transfer.view;
      });
    },

    /**
     * Clique num chamado da lista (tela 3, 11.5): a resposta é montada pelo código, sem o modelo.
     * O chamado é buscado com o funcionário da sessão, então só os dele aparecem (RN09). Com a
     * conversa num analista, o clique fica registrado para ele e ninguém responde (RN08).
     */
    async selectTicket(employee: UserRow, number: string) {
      const ticketNumber = parseTicketNumber(number);
      if (!ticketNumber) throw new AppError("INVALID_REQUEST", "Número de chamado inválido.");
      const conversation = await openConversationFor(employee);
      return withConversationLock(conversation.id, async () => {
        const now = clock.now();
        if (!agentMayReply(conversation.mode)) {
          await saveEmployeeMessage(conversation.id, employee.id, ticketNumber, now, undefined);
          return;
        }
        // Busca antes de gravar: se o chamado não é dele ou o sistema caiu, nada fica pela metade.
        const ticket = toTicketDetails(
          await ticketGateway.getTicket(employee.id, ticketNumber),
          now,
        );
        await saveEmployeeMessage(conversation.id, employee.id, ticketNumber, now, undefined);
        const reply = await conversationStore.appendMessage({
          conversationId: conversation.id,
          author: "agent",
          authorId: null,
          parts: selectedTicketParts(ticket, `select-${ticketNumber}`),
          createdAt: now,
        });
        await decisionService.recordButtonAction({
          conversationId: conversation.id,
          conversationVersion: conversation.version,
          messageId: reply.id,
          description: `Funcionário escolheu o chamado ${ticketNumber} na lista.`,
          at: now,
          intent: "ticket_status",
          step: "ticket_selection",
        });
      });
    },

    /**
     * Grava a mensagem do funcionário e devolve a resposta do agent em streaming. Com a conversa
     * transferida ou com um analista, o agent nem é chamado (RN08): a mensagem fica para o analista.
     */
    async sendMessage(
      employee: UserRow,
      text: string,
      client: { ip: string; messageId?: string; quickOption?: boolean },
    ): Promise<ReadableStream<UIMessageChunk>> {
      const conversation = await openConversationFor(employee);
      if (!agentMayReply(conversation.mode)) {
        if (!quota.tryConsumeForAnalyst(employee.id))
          throw new AppError(
            "RATE_LIMITED",
            "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
          );
        await saveEmployeeMessage(
          conversation.id,
          employee.id,
          text,
          clock.now(),
          client.messageId,
        );
        await chatSessionService.touch(conversation);
        return createUIMessageStream({ execute: () => undefined });
      }
      if (busyConversations.has(conversation.id)) {
        throw new AppError("CONFLICT", "Aguarde a resposta anterior do Nexo Assist.");
      }
      busyConversations.add(conversation.id);
      const release = () => busyConversations.delete(conversation.id);

      try {
        // RN14: com a sessão no limite, recusa antes de gastar a cota de uso.
        await chatSessionService.assertBelowLimit(conversation);
        // A cota do modelo é gasta aqui, com a trava da conversa e a mesma leitura que decidiu
        // chamar o agent (ADR-0010, A13).
        const withinQuota = await quota.tryConsumeForAgent({
          employeeId: employee.id,
          ip: client.ip,
        });
        if (!withinQuota)
          throw new AppError(
            "RATE_LIMITED",
            "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
          );
        // RN14: conta a mensagem na sessão (ou recusa, na 31ª).
        const session = await chatSessionService.countAgentMessage(conversation);
        const turnStartedAt = clock.now();
        // Etapa 1 (R05): o classificador vê a mensagem nova e um pouco do que veio antes.
        const previous = await conversationStore.listRecentMessages(
          conversation.id,
          CLASSIFIER_CONTEXT,
        );
        const classification =
          (client.quickOption && (await classifyQuickAnswer(previous, text))) ||
          (await classifier.classify(previous.map(toTranscriptLine), text));
        await saveEmployeeMessage(
          conversation.id,
          employee.id,
          text,
          turnStartedAt,
          client.messageId,
        );
        // A classificação leva segundos: a conversa pode ter sido transferida nesse meio-tempo
        // (por exemplo, um chamado crítico confirmado pelo botão). Aí a mensagem fica para o
        // analista e o agent não responde (RN08).
        const current = await conversationStore.findById(conversation.id);
        if (!current || !agentMayReply(current.mode)) {
          release();
          return createUIMessageStream({ execute: () => undefined });
        }
        const turn = {
          employeeId: employee.id,
          conversationId: conversation.id,
          conversationVersion: current.version,
          classification,
          startedAt: turnStartedAt,
        };
        // R39: segunda mensagem seguida sem dar para entender vai para um analista, sem o agent.
        const route = await decisionService.routeTurn(turn);
        if (route.kind !== "agent") {
          release();
          return route.kind === "escalated"
            ? systemNoticeStream(route.notice)
            : createUIMessageStream({ execute: () => undefined });
        }

        // O agent vê só a sessão atual; o que veio antes chega pelo resumo (R03, custo por turno).
        const history = keepWithinCharBudget(
          await loadHistory(conversation.id, toAgentHistoryMessage, session.startedAt),
          HISTORY_MAX_CHARS,
        );
        const previousSummary = await chatSessionService.previousSummary(conversation.id);
        const pendingDrafts = await draftService.describePending(conversation.id);
        // RT10: tokens que o agent gastou no turno, informados pelo Mastra quando ele termina.
        const usage: { agentTokens?: number } = {};
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
            system: describeTurnContext(classification, previousSummary, pendingDrafts),
            requestContext: createAgentRequestContext({
              employeeId: employee.id,
              conversationId: conversation.id,
              startedAt: turnStartedAt,
            }),
            onFinish: ({ totalUsage }) => {
              if (totalUsage.totalTokens !== undefined) usage.agentTokens = totalUsage.totalTokens;
            },
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
                  // O mesmo id do stream: a tela não troca a bolha ao recarregar a conversa.
                  id: responseMessage.id,
                  conversationId: conversation.id,
                  author: "agent",
                  authorId: null,
                  parts: responseMessage.parts,
                  createdAt: clock.now(),
                });
                // R04: só o rascunho que a resposta gravada mostra ("D-12") conta como visto.
                await draftService.markShownInReply(conversation.id, textOf(responseMessage));
                await decisionService.record({
                  ...turn,
                  messageId: saved.id,
                  response: responseMessage,
                  ...usage,
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

/** As mensagens mais novas que cabem no orçamento de texto; a mais nova entra sempre. */
export function keepWithinCharBudget(messages: UIMessage[], maxChars: number): UIMessage[] {
  const kept: UIMessage[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) {
    const size = textOf(message).length;
    if (kept.length > 0 && used + size > maxChars) break;
    kept.unshift(message);
    used += size;
  }
  return kept;
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

/**
 * Contexto de sistema do turno: a classificação da etapa 1 e, se houver, o resumo da sessão anterior
 * e os rascunhos pendentes (R03). Tudo gerado pelo código, sem texto livre do funcionário.
 */
function describeTurnContext(
  classification: ClassificationResult,
  previousSummary: string | null,
  pendingDrafts: string | null,
): string {
  const lines = [describeClassification(classification)];
  if (previousSummary) lines.push(`Resumo da sessão anterior desta conversa: ${previousSummary}`);
  if (pendingDrafts) lines.push(`Rascunhos pendentes desta conversa: ${pendingDrafts}.`);
  return lines.join("\n");
}

/** Faixas de confiança com os mesmos nomes do prompt do classificador. */
function confidenceLevel(confidence: number): string {
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return "baixa";
  return confidence < HIGH_CONFIDENCE ? "média" : "alta";
}

/**
 * A classificação da etapa 1 como o agent a recebe (R05). Só intenção e confiança: o "entendido"
 * parafraseia o texto do funcionário e não pode entrar no contexto de sistema do agent.
 */
function describeClassification({ classification }: ClassificationResult): string {
  return `Classificação da mensagem atual, feita antes de você (etapa 1): intenção "${INTENT_LABELS[classification.intent]}"; confiança ${confidenceLevel(classification.confidence)} (${classification.confidence}).`;
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
    metadata: { author: row.author, createdAt: row.createdAt.toISOString() },
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
