import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { ChatSessionStore } from "../db/chat-session-store.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { DecisionStore } from "../db/decision-store.ts";
import type { ChatSessionRow, ConversationRow, SessionEndReason } from "../db/schema.ts";
import { agentMayReply } from "./conversation-state.ts";

/** RN14: mensagens do funcionário ao agent por sessão. */
export const SESSION_MESSAGE_LIMIT = 30;

/** A05: sem atividade por este tempo, a próxima mensagem abre uma sessão nova. */
export const SESSION_INACTIVITY_MS = 8 * 60 * 60 * 1000;

const SUMMARY_MAX_TOPICS = 5;
const SUMMARY_MAX_CHARS = 600;

type ChatSessionServiceDependencies = {
  chatSessionStore: ChatSessionStore;
  conversationStore: ConversationStore;
  decisionStore: DecisionStore;
  clock: Clock;
};

type ConversationRef = Pick<ConversationRow, "id" | "mode">;

/**
 * Sessões de atendimento (RN14, A05, R03). A conversa continua a mesma; a sessão é o trecho com
 * limite de mensagens ao agent. Uma sessão nova mostra o histórico anterior, abre com o resumo da
 * anterior e herda os rascunhos pendentes, que pertencem à conversa.
 */
export function createChatSessionService({
  chatSessionStore,
  conversationStore,
  decisionStore,
  clock,
}: ChatSessionServiceDependencies) {
  /**
   * Resumo da sessão que termina, montado pelo código a partir do que ficou registrado: os assuntos
   * que o classificador entendeu e as linhas de sistema (rascunhos, transferências). Sem chamar o
   * modelo: não gasta cota e não inventa nada.
   */
  async function summarize(session: ChatSessionRow): Promise<string> {
    const traces = await decisionStore.listSince(session.conversationId, session.startedAt);
    const topics = [
      ...new Set(
        traces
          .filter((trace) => !trace.steps.some((step) => step.tool === "draft_button"))
          .map((trace) => trace.understood),
      ),
    ].slice(-SUMMARY_MAX_TOPICS);
    const records = (
      await conversationStore.listRecentMessages(session.conversationId, 100, session.startedAt)
    )
      .filter((row) => row.author === "system")
      .map((row) => (JSON.parse(row.parts) as { text?: string }[])[0]?.text ?? "")
      .filter((text) => text.length > 0);

    const parts = [
      topics.length > 0 ? `Assuntos: ${topics.join("; ")}.` : "",
      records.length > 0 ? `Registros: ${records.join(" ")}` : "",
    ].filter((part) => part.length > 0);
    const summary = parts.join(" ") || "Sessão sem assuntos registrados.";
    return summary.length <= SUMMARY_MAX_CHARS
      ? summary
      : `${summary.slice(0, SUMMARY_MAX_CHARS - 1)}…`;
  }

  async function endAndStart(
    conversationId: string,
    session: ChatSessionRow,
    reason: SessionEndReason,
  ) {
    const now = clock.now();
    await chatSessionStore.end(session.id, reason, await summarize(session), now);
    // Duas abas ao mesmo tempo: se a outra já abriu a nova sessão, usa a dela.
    return (
      (await chatSessionStore.findActive(conversationId)) ??
      chatSessionStore.start(conversationId, now)
    );
  }

  /** A sessão em que a próxima mensagem entra. Inativa há mais de 8 h com o agent, recomeça (A05). */
  async function current(conversation: ConversationRef): Promise<ChatSessionRow> {
    const active = await chatSessionStore.findActive(conversation.id);
    if (!active) return chatSessionStore.start(conversation.id, clock.now());
    const idleMs = clock.now().getTime() - active.lastActivityAt.getTime();
    // R41: com a conversa com um analista, a sessão não expira.
    if (idleMs > SESSION_INACTIVITY_MS && agentMayReply(conversation.mode)) {
      return endAndStart(conversation.id, active, "inactivity");
    }
    return active;
  }

  return {
    current,

    /** A sessão ativa, sem abrir uma (a tela só consulta). */
    activeSession(conversationId: string) {
      return chatSessionStore.findActive(conversationId);
    },

    /**
     * Conta a mensagem que vai para o agent (R42: só essas contam). Na 31ª, recusa: o funcionário
     * começa uma sessão nova ou fala com um analista.
     */
    async countAgentMessage(conversation: ConversationRef): Promise<ChatSessionRow> {
      const session = await current(conversation);
      const counted = await chatSessionStore.countAgentMessage(
        session.id,
        SESSION_MESSAGE_LIMIT,
        clock.now(),
      );
      if (!counted) {
        throw new AppError(
          "SESSION_LIMIT",
          `Esta sessão chegou ao limite de ${SESSION_MESSAGE_LIMIT} mensagens. Comece uma nova sessão ou fale com um analista.`,
        );
      }
      return counted;
    },

    /** Mensagem para o analista: mantém a sessão viva, sem contar. */
    async touch(conversation: ConversationRef): Promise<void> {
      await chatSessionStore.touch((await current(conversation)).id, clock.now());
    },

    /** "Nova sessão": encerra a atual, com resumo, e abre outra. */
    async startNew(conversation: ConversationRef): Promise<ChatSessionRow> {
      const active = await chatSessionStore.findActive(conversation.id);
      if (!active) return chatSessionStore.start(conversation.id, clock.now());
      const reason = active.agentMessages >= SESSION_MESSAGE_LIMIT ? "limit" : "new_session";
      return endAndStart(conversation.id, active, reason);
    },

    /** O resumo da sessão anterior, para abrir a atual (R03). */
    async previousSummary(conversationId: string): Promise<string | null> {
      return (await chatSessionStore.latestEnded(conversationId))?.summary ?? null;
    },
  };
}

export type ChatSessionService = ReturnType<typeof createChatSessionService>;

/** A sessão como a tela mostra: o contador "18/30" e se o limite chegou. */
export function toSessionView(session: ChatSessionRow, previousSummary: string | null) {
  return {
    agentMessages: session.agentMessages,
    limit: SESSION_MESSAGE_LIMIT,
    isAtLimit: session.agentMessages >= SESSION_MESSAGE_LIMIT,
    startedAt: session.startedAt.toISOString(),
    previousSummary,
  };
}

export type SessionView = ReturnType<typeof toSessionView>;
