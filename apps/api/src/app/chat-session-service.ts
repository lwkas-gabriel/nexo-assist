import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import { z } from "zod";
import type { ChatSessionStore } from "../db/chat-session-store.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { DecisionStore } from "../db/decision-store.ts";
import type { ChatSessionRow, ConversationRow, SessionEndReason } from "../db/schema.ts";
import { SESSION_MESSAGE_LIMIT, isSessionAtLimit, isSessionExpired } from "./session-state.ts";

export { SESSION_MESSAGE_LIMIT } from "./session-state.ts";

/** Quantas linhas de sistema da sessão o resumo considera, das mais novas para as mais antigas. */
const SUMMARY_MAX_RECORDS = 50;
/** Espaço do resumo: os registros (pendências, chamados) vêm primeiro; os assuntos, no que sobrar. */
const SUMMARY_MAX_CHARS = 600;

/** Ações do código e dos botões não são assuntos da conversa. */
const NOT_TOPICS = new Set(["draft_button", "handoff_to_analyst"]);

type ChatSessionServiceDependencies = {
  chatSessionStore: ChatSessionStore;
  conversationStore: ConversationStore;
  decisionStore: DecisionStore;
  clock: Clock;
};

type ConversationRef = Pick<ConversationRow, "id" | "mode" | "updatedAt">;

const textPartsSchema = z.array(z.object({ type: z.string(), text: z.string().optional() }));

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
   * Resumo da sessão, montado só com o que o código escreveu: as intenções que o classificador
   * identificou (rótulos fixos) e as linhas de sistema (rascunhos, chamados, transferências).
   * Nada do texto do funcionário: o resumo vai para o contexto de sistema do agent na sessão
   * seguinte, e texto livre ali seria uma porta de injeção de instruções.
   */
  async function summarize(session: ChatSessionRow): Promise<string> {
    const rows = await conversationStore.listRecentMessages(
      session.conversationId,
      SUMMARY_MAX_RECORDS,
      session.startedAt,
    );
    const records: string[] = [];
    let used = 0;
    for (const row of rows.filter((candidate) => candidate.author === "system").reverse()) {
      const text = textPartsSchema.safeParse(JSON.parse(row.parts)).data?.[0]?.text?.trim();
      if (!text || used + text.length > SUMMARY_MAX_CHARS) continue;
      records.unshift(text);
      used += text.length + 1;
    }

    const traces = await decisionStore.listSince(session.conversationId, session.startedAt);
    const topics = [
      ...new Set(
        traces
          .filter((trace) => !trace.steps.some((step) => NOT_TOPICS.has(step.tool)))
          .map((trace) => trace.intent),
      ),
    ];

    const parts = [
      records.length > 0 ? `Registros: ${records.join(" ")}` : "",
      topics.length > 0 ? `Assuntos: ${topics.join(", ")}.` : "",
    ].filter((part) => part.length > 0);
    const summary = parts.join(" ") || "Sessão sem assuntos registrados.";
    return summary.length <= SUMMARY_MAX_CHARS
      ? summary
      : `${summary.slice(0, SUMMARY_MAX_CHARS - 1)}…`;
  }

  /**
   * Encerra a sessão e abre outra. Só quem conseguiu encerrar abre a nova; quem perdeu a corrida
   * usa a que já existe (o banco garante uma ativa por conversa).
   */
  async function endAndStart(session: ChatSessionRow, reason: SessionEndReason) {
    const now = clock.now();
    await chatSessionStore.end(session.id, reason, await summarize(session), now);
    return chatSessionStore.start(session.conversationId, now);
  }

  /** A sessão em que a próxima mensagem entra; vencida por inatividade, recomeça (A05). */
  async function current(conversation: ConversationRef): Promise<ChatSessionRow> {
    const active = await chatSessionStore.findActive(conversation.id);
    if (!active) return chatSessionStore.start(conversation.id, clock.now());
    if (isSessionExpired(active, conversation, clock.now())) {
      return endAndStart(active, "inactivity");
    }
    return active;
  }

  async function previousSummary(conversationId: string): Promise<string | null> {
    return (await chatSessionStore.latestEnded(conversationId))?.summary ?? null;
  }

  function limitReached(): AppError {
    return new AppError(
      "SESSION_LIMIT",
      `Esta sessão chegou ao limite de ${SESSION_MESSAGE_LIMIT} mensagens. Comece uma nova sessão ou fale com um analista.`,
    );
  }

  return {
    current,
    previousSummary,

    /** O que já aconteceu na sessão atual, para o resumo de uma transferência pelo botão. */
    async describeCurrent(conversation: ConversationRef): Promise<string> {
      const active = await chatSessionStore.findActive(conversation.id);
      return active ? summarize(active) : "Sessão sem assuntos registrados.";
    },

    /** Antes de gastar cota: a próxima mensagem ao agent seria recusada pelo limite? */
    async assertBelowLimit(conversation: ConversationRef): Promise<void> {
      const active = await chatSessionStore.findActive(conversation.id);
      if (!active || isSessionExpired(active, conversation, clock.now())) return;
      if (isSessionAtLimit(active)) throw limitReached();
    },

    /**
     * Conta a mensagem que vai para o agent (R42: só essas contam). Na 31ª, recusa: o funcionário
     * começa uma sessão nova ou fala com um analista. A mensagem conta antes da etapa 1, mesmo
     * que depois o limiar a transfira: o classificador já foi chamado por ela.
     */
    async countAgentMessage(conversation: ConversationRef): Promise<ChatSessionRow> {
      const session = await current(conversation);
      const counted = await chatSessionStore.countAgentMessage(
        session.id,
        SESSION_MESSAGE_LIMIT,
        clock.now(),
      );
      if (!counted) throw limitReached();
      return counted;
    },

    /** Mensagem para o analista: mantém a sessão viva, sem contar. */
    async touch(conversation: ConversationRef): Promise<void> {
      await chatSessionStore.touch((await current(conversation)).id, clock.now());
    },

    /** "Nova sessão": encerra a atual, com resumo, e abre outra. Sessão ainda vazia fica como está. */
    async startNew(conversation: ConversationRef): Promise<ChatSessionRow> {
      const active = await chatSessionStore.findActive(conversation.id);
      if (!active) return chatSessionStore.start(conversation.id, clock.now());
      if (active.agentMessages === 0) return active;
      return endAndStart(active, isSessionAtLimit(active) ? "limit" : "new_session");
    },

    /**
     * A sessão como a tela mostra (RF10), sem abrir nem encerrar nada. Vencida por inatividade,
     * a tela já mostra o que a próxima mensagem vai encontrar: contador zerado e o resumo dela.
     */
    async view(conversation: ConversationRef): Promise<SessionView | null> {
      const active = await chatSessionStore.findActive(conversation.id);
      if (!active) return null;
      if (isSessionExpired(active, conversation, clock.now())) {
        return {
          agentMessages: 0,
          limit: SESSION_MESSAGE_LIMIT,
          isAtLimit: false,
          // A próxima mensagem é que abre a sessão nova; até lá, ela não tem início.
          startedAt: null,
          previousSummary: await summarize(active),
        };
      }
      return toSessionView(active, await previousSummary(conversation.id));
    },
  };
}

export type ChatSessionService = ReturnType<typeof createChatSessionService>;

/** A sessão como a tela mostra: o contador "18/30" e se o limite chegou. */
export function toSessionView(session: ChatSessionRow, previousSummary: string | null) {
  return {
    agentMessages: session.agentMessages,
    limit: SESSION_MESSAGE_LIMIT,
    isAtLimit: isSessionAtLimit(session),
    /** Onde a tela põe o resumo da sessão anterior, entre as mensagens. */
    startedAt: session.startedAt.toISOString() as string | null,
    previousSummary,
  };
}

export type SessionView = ReturnType<typeof toSessionView>;
