import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { HandoffStore } from "../db/handoff-store.ts";
import type { ConversationRow, UserRow } from "../db/schema.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import type { ChatSessionService } from "./chat-session-service.ts";
import { CONVERSATION_BUSY_MESSAGE, type ConversationLocks } from "./conversation-locks.ts";
import { nextMode, type ConversationEvent } from "./conversation-state.ts";

type ConsoleActionsDependencies = {
  conversationStore: ConversationStore;
  handoffStore: HandoffStore;
  ticketGateway: TicketGateway;
  chatSessionService: ChatSessionService;
  locks: ConversationLocks;
  clock: Clock;
};

/** O que dizer quando a tela do analista está velha: em português, sem os nomes dos estados. */
const STALE_STATE_MESSAGES = {
  agent: "Esta conversa já voltou ao assistente; atualize a tela.",
  analyst: "Outro analista já assumiu esta conversa.",
  waiting_analyst: "Assuma o atendimento antes.",
  closed: "Esta conversa foi fechada.",
} as const;

/**
 * Tela 5 (RF20): o analista assume, responde, devolve ao agent e encerra o atendimento. Cada ação
 * passa pela trava da conversa (R06, junto com o turno do agent e os botões do funcionário) e só
 * troca o estado se ninguém o mudou antes. O sistema de chamados é chamado depois de soltar a
 * trava: as novas tentativas dele não seguram o chat do funcionário.
 */
export function createConsoleActions({
  conversationStore,
  handoffStore,
  ticketGateway,
  chatSessionService,
  locks,
  clock,
}: ConsoleActionsDependencies) {
  async function findOpen(conversationId: string): Promise<ConversationRow> {
    const conversation = await conversationStore.findById(conversationId);
    if (!conversation || conversation.mode === "closed") {
      throw new AppError("NOT_FOUND", "Conversa não encontrada.");
    }
    return conversation;
  }

  /** A ação só vale com a conversa num destes estados; senão, a tela do analista está velha. */
  function expectMode(conversation: ConversationRow, allowed: ConversationRow["mode"][]) {
    if (!allowed.includes(conversation.mode)) {
      throw new AppError("CONFLICT", STALE_STATE_MESSAGES[conversation.mode]);
    }
  }

  /** Com a conversa com um analista, só ele age nela (responder, devolver, encerrar). */
  function assertAssignedTo(conversation: ConversationRow, analyst: UserRow) {
    if (conversation.mode === "analyst" && conversation.assignedAnalystId !== analyst.id) {
      throw new AppError("FORBIDDEN", "Outro analista está atendendo esta conversa.");
    }
  }

  async function changeMode(
    conversation: ConversationRow,
    event: ConversationEvent,
    to: { mode: ConversationRow["mode"]; assignedAnalystId: string | null },
  ) {
    // A tabela da 11.3 continua sendo a fonte da regra (expectMode só dá a mensagem para a tela).
    nextMode(conversation.mode, event);
    const changed = await conversationStore.changeMode(conversation, { ...to, now: clock.now() });
    if (!changed) {
      throw new AppError("CONFLICT", "A conversa mudou enquanto isso; atualize a tela.");
    }
    return changed;
  }

  async function systemLine(conversationId: string, text: string, at: Date = clock.now()) {
    await conversationStore.appendMessage({
      conversationId,
      author: "system",
      authorId: null,
      parts: [{ type: "text", text }],
      createdAt: at,
    });
  }

  /**
   * O chamado da transferência acompanha o atendimento (R31, 11.3). Uma falha no sistema de
   * chamados não desfaz a ação: o chamado fica como estava, e a falha vai para o log.
   */
  async function updateLinkedTicket(
    conversation: ConversationRow,
    update: (employeeId: string, number: string, key: string) => Promise<unknown>,
    keyPrefix: string,
  ) {
    const handoff = await handoffStore.latestForConversation(conversation.id);
    if (!handoff?.ticketNumber) return;
    try {
      await update(conversation.employeeId, handoff.ticketNumber, `${keyPrefix}-${handoff.id}`);
    } catch (error) {
      console.error(`Chamado ${handoff.ticketNumber} não acompanhou o atendimento`, error);
    }
  }

  return {
    /** Assumir: o agent fica pausado e o funcionário vê quem o atende (RF20, R27). */
    async assume(analyst: UserRow, conversationId: string) {
      const changed = await locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        expectMode(conversation, ["waiting_analyst"]);
        const assumed = await changeMode(conversation, "assume", {
          mode: "analyst",
          assignedAnalystId: analyst.id,
        });
        await systemLine(
          conversation.id,
          `${analyst.name} (${analyst.department}) assumiu o atendimento.`,
        );
        return assumed;
      });
      await updateLinkedTicket(
        changed,
        (employeeId, number, key) =>
          ticketGateway.assumeTicket(employeeId, number, analyst.name, key),
        "assume",
      );
      return { mode: changed.mode, version: changed.version };
    },

    /** Responder: só quem assumiu; a mensagem vai para o funcionário, sem passar pelo agent. */
    async reply(analyst: UserRow, conversationId: string, text: string) {
      return locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        expectMode(conversation, ["analyst"]);
        assertAssignedTo(conversation, analyst);
        const message = await conversationStore.appendMessage({
          conversationId: conversation.id,
          author: "analyst",
          authorId: analyst.id,
          parts: [{ type: "text", text }],
          createdAt: clock.now(),
        });
        return { id: message.id };
      });
    },

    /**
     * Devolver ao agent (R18): ele não responde agora; volta na próxima mensagem do funcionário,
     * vendo as mensagens do analista no histórico. Vale também sem assumir (11.3). O chamado sai
     * de "aguardando analista" ou "em atendimento": ninguém está a caminho pelo chat.
     */
    async release(analyst: UserRow, conversationId: string) {
      const changed = await locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        expectMode(conversation, ["waiting_analyst", "analyst"]);
        assertAssignedTo(conversation, analyst);
        const released = await changeMode(conversation, "release", {
          mode: "agent",
          assignedAnalystId: null,
        });
        await systemLine(conversation.id, `${analyst.name} devolveu a conversa ao assistente.`);
        return released;
      });
      await updateLinkedTicket(
        changed,
        (employeeId, number, key) =>
          ticketGateway.releaseTicket(employeeId, number, analyst.name, key),
        `release-${changed.version}`,
      );
      return { mode: changed.mode, version: changed.version };
    },

    /**
     * Encerrar o atendimento (A08, ADR-0007): a conversa volta ao agent com uma sessão nova, que
     * abre com o resumo da que acabou. O chamado segue o próprio status.
     */
    async endService(analyst: UserRow, conversationId: string) {
      return locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        expectMode(conversation, ["analyst"]);
        assertAssignedTo(conversation, analyst);
        const endedAt = clock.now();
        await systemLine(conversation.id, `Atendimento encerrado por ${analyst.name}.`, endedAt);
        const changed = await changeMode(conversation, "release", {
          mode: "agent",
          assignedAnalystId: null,
        });
        // A sessão nova começa depois da linha: ela fica na sessão que acabou (e no resumo dela),
        // e o card do resumo aparece depois dela na tela (10.5).
        await chatSessionService.endAfterService(changed, new Date(endedAt.getTime() + 1));
        return { mode: changed.mode, version: changed.version };
      });
    },
  };
}

export type ConsoleActions = ReturnType<typeof createConsoleActions>;
