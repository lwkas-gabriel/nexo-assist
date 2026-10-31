import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { HandoffStore } from "../db/handoff-store.ts";
import type { ConversationRow, UserRow } from "../db/schema.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import type { ChatSessionService } from "./chat-session-service.ts";
import type { ConversationLocks } from "./conversation-locks.ts";
import { nextMode, type ConversationEvent } from "./conversation-state.ts";

const BUSY_MESSAGE = "O assistente está respondendo agora; tente de novo em instantes.";

type ConsoleActionsDependencies = {
  conversationStore: ConversationStore;
  handoffStore: HandoffStore;
  ticketGateway: TicketGateway;
  chatSessionService: ChatSessionService;
  locks: ConversationLocks;
  clock: Clock;
};

/**
 * Tela 5 (RF20): o analista assume, responde, devolve ao agent e encerra o atendimento. Cada ação
 * passa pela máquina de estados (11.3) e pela trava da conversa (R06); a troca de estado só vale
 * se ninguém mudou a conversa antes (dois analistas assumindo juntos: um só consegue).
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
    nextMode(conversation.mode, event);
    const changed = await conversationStore.changeMode(conversation, { ...to, now: clock.now() });
    if (!changed) {
      throw new AppError("CONFLICT", "A conversa mudou enquanto isso; atualize a tela.");
    }
    return changed;
  }

  async function systemLine(conversationId: string, text: string) {
    await conversationStore.appendMessage({
      conversationId,
      author: "system",
      authorId: null,
      parts: [{ type: "text", text }],
      createdAt: clock.now(),
    });
  }

  /**
   * R31: o chamado da transferência fica "em atendimento". Uma falha no sistema de chamados não
   * desfaz o assumir: o analista já está com a conversa, e o chamado fica como estava.
   */
  async function markTicketInService(conversation: ConversationRow, analyst: UserRow) {
    const handoff = await handoffStore.latestForConversation(conversation.id);
    if (!handoff?.ticketNumber) return;
    try {
      await ticketGateway.assumeTicket(
        conversation.employeeId,
        handoff.ticketNumber,
        analyst.name,
        `assume-${handoff.id}`,
      );
    } catch (error) {
      console.error(`Chamado ${handoff.ticketNumber} não ficou em atendimento`, error);
    }
  }

  return {
    /** Assumir: o agent fica pausado e o funcionário vê quem o atende (RF20, R27). */
    async assume(analyst: UserRow, conversationId: string) {
      return locks.run(conversationId, BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        if (conversation.mode === "analyst") {
          throw new AppError("CONFLICT", "Outro analista já assumiu esta conversa.");
        }
        const changed = await changeMode(conversation, "assume", {
          mode: "analyst",
          assignedAnalystId: analyst.id,
        });
        await systemLine(
          conversation.id,
          `${analyst.name} (${analyst.department}) assumiu o atendimento.`,
        );
        await markTicketInService(conversation, analyst);
        return { mode: changed.mode, version: changed.version };
      });
    },

    /** Responder: só quem assumiu; a mensagem vai para o funcionário, sem passar pelo agent. */
    async reply(analyst: UserRow, conversationId: string, text: string) {
      return locks.run(conversationId, BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        if (conversation.mode !== "analyst") {
          throw new AppError("CONFLICT", "Assuma o atendimento para responder.");
        }
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
     * vendo as mensagens do analista no histórico.
     */
    async release(analyst: UserRow, conversationId: string) {
      return locks.run(conversationId, BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        assertAssignedTo(conversation, analyst);
        const changed = await changeMode(conversation, "release", {
          mode: "agent",
          assignedAnalystId: null,
        });
        await systemLine(conversation.id, `${analyst.name} devolveu a conversa ao assistente.`);
        return { mode: changed.mode, version: changed.version };
      });
    },

    /**
     * Encerrar o atendimento (A08, ADR-0007): a conversa volta ao agent com uma sessão nova, que
     * abre com o resumo da que acabou. O chamado segue o próprio status.
     */
    async endService(analyst: UserRow, conversationId: string) {
      return locks.run(conversationId, BUSY_MESSAGE, async () => {
        const conversation = await findOpen(conversationId);
        if (conversation.mode !== "analyst") {
          throw new AppError("CONFLICT", "Só dá para encerrar um atendimento assumido.");
        }
        assertAssignedTo(conversation, analyst);
        await systemLine(conversation.id, `Atendimento encerrado por ${analyst.name}.`);
        const changed = await changeMode(conversation, "release", {
          mode: "agent",
          assignedAnalystId: null,
        });
        await chatSessionService.endAfterService(changed);
        return { mode: changed.mode, version: changed.version };
      });
    },
  };
}

export type ConsoleActions = ReturnType<typeof createConsoleActions>;
