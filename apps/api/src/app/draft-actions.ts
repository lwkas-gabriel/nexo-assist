import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { Intent } from "../agent/classifier.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { DecisionService } from "./decision-service.ts";
import type { DraftService, DraftView, NewTicketInput } from "./draft-service.ts";
import { CONVERSATION_BUSY_MESSAGE, type ConversationLocks } from "./conversation-locks.ts";
import type { HandoffService } from "./handoff-service.ts";

type DraftActionsDependencies = {
  locks: ConversationLocks;
  draftService: DraftService;
  handoffService: HandoffService;
  decisionService: DecisionService;
  conversationStore: ConversationStore;
  clock: Clock;
};

/** O que aconteceu com o rascunho, como fica registrado na conversa. */
function confirmedLine(draft: DraftView): string {
  const ticket = draft.ticketNumber ?? "";
  if (draft.kind === "create") {
    return `Rascunho ${draft.draftId} confirmado: chamado ${ticket} criado.`;
  }
  if (draft.kind === "reopen") {
    return `Rascunho ${draft.draftId} confirmado: chamado ${ticket} reaberto com o complemento.`;
  }
  return `Rascunho ${draft.draftId} confirmado: complemento enviado ao chamado ${ticket}.`;
}

/** Cancelar ou editar mexe no pedido do rascunho: abrir um chamado ou complementar um existente. */
function draftIntent(draft: DraftView): Intent {
  return draft.kind === "create" ? "new_ticket" : "ticket_update";
}

/**
 * Botões do card de rascunho (Confirmar, Cancelar, Editar), sem passar pelo LLM (11.5).
 * Valem só para rascunhos da conversa em andamento, e cada ação vira uma linha de sistema
 * nela: o funcionário vê o registro e o agent, no próximo turno, sabe o que mudou. Cada uma
 * passa pela trava da conversa (R06): confirmar um crítico transfere (A04), e um assumir no
 * meio veria a conversa transferida com o chamado ainda sendo marcado.
 */
export function createDraftActions({
  locks,
  draftService,
  handoffService,
  decisionService,
  conversationStore,
  clock,
}: DraftActionsDependencies) {
  async function currentConversationId(employeeId: string, draftNumber: number) {
    const conversation = await conversationStore.findOpenByEmployee(employeeId);
    if (!conversation) throw new AppError("NOT_FOUND", `Rascunho D-${draftNumber} não encontrado.`);
    return conversation.id;
  }

  /**
   * Linha de sistema na conversa, com o registro de decisão de uma ação determinística (11.5).
   * Lida depois da ação, a versão da conversa é a do momento em que o clique aconteceu.
   */
  /** Linha de sistema e registro de decisão do clique; a intenção diz o que o botão fez. */
  async function recordInConversation(conversationId: string, text: string, intent: Intent) {
    const at = clock.now();
    const line = await conversationStore.appendMessage({
      conversationId,
      author: "system",
      authorId: null,
      parts: [{ type: "text", text }],
      createdAt: at,
    });
    const conversation = await conversationStore.findById(conversationId);
    await decisionService.recordButtonAction({
      conversationId,
      conversationVersion: conversation?.version ?? 0,
      messageId: line.id,
      description: text,
      at,
      intent,
      step: "draft_button",
    });
  }

  return {
    async confirm(employeeId: string, draftNumber: number) {
      const conversationId = await currentConversationId(employeeId, draftNumber);
      return locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const result = await draftService.confirm({
          employeeId,
          draftNumber,
          conversationId,
          source: { via: "button" },
        });
        await recordInConversation(conversationId, confirmedLine(result.draft), "confirm_draft");
        // A04: chamado crítico vai direto para o N2, também quando confirmado pelo botão.
        const escalation = await handoffService.escalateNewCriticalTicket({
          employeeId,
          conversationId,
          draft: result.draft,
          ticket: result.ticket,
        });
        return { ...result, ...escalation };
      });
    },

    async cancel(employeeId: string, draftNumber: number) {
      const conversationId = await currentConversationId(employeeId, draftNumber);
      return locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const draft = await draftService.cancel({ employeeId, draftNumber, conversationId });
        await recordInConversation(
          conversationId,
          `Rascunho ${draft.draftId} cancelado.`,
          draftIntent(draft),
        );
        return draft;
      });
    },

    /** R16: edição pelo card; a linha de sistema leva a prioridade recalculada. */
    async edit(employeeId: string, draftNumber: number, changes: NewTicketInput) {
      const conversationId = await currentConversationId(employeeId, draftNumber);
      return locks.run(conversationId, CONVERSATION_BUSY_MESSAGE, async () => {
        const draft = await draftService.edit({ employeeId, draftNumber, conversationId, changes });
        const priority = "ticket" in draft ? ` Prioridade: ${draft.ticket.priority}.` : "";
        await recordInConversation(
          conversationId,
          `Rascunho ${draft.draftId} editado pelo funcionário.${priority}`,
          draftIntent(draft),
        );
        return draft;
      });
    },
  };
}

export type DraftActions = ReturnType<typeof createDraftActions>;
