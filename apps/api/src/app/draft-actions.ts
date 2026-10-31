import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { DecisionService } from "./decision-service.ts";
import type { DraftService, DraftView, NewTicketInput } from "./draft-service.ts";
import type { HandoffService } from "./handoff-service.ts";

type DraftActionsDependencies = {
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

/**
 * Botões do card de rascunho (Confirmar, Cancelar, Editar), sem passar pelo LLM (11.5).
 * Valem só para rascunhos da conversa em andamento, e cada ação vira uma linha de sistema
 * nela: o funcionário vê o registro e o agent, no próximo turno, sabe o que mudou.
 */
export function createDraftActions({
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
  async function recordInConversation(conversationId: string, text: string) {
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
    });
  }

  return {
    async confirm(employeeId: string, draftNumber: number) {
      const conversationId = await currentConversationId(employeeId, draftNumber);
      const result = await draftService.confirm({
        employeeId,
        draftNumber,
        conversationId,
        source: { via: "button" },
      });
      await recordInConversation(conversationId, confirmedLine(result.draft));
      // A04: chamado crítico vai direto para o N2, também quando confirmado pelo botão.
      const escalation = await handoffService.escalateNewCriticalTicket({
        employeeId,
        conversationId,
        draft: result.draft,
        ticket: result.ticket,
      });
      return { ...result, ...escalation };
    },

    async cancel(employeeId: string, draftNumber: number) {
      const conversationId = await currentConversationId(employeeId, draftNumber);
      const draft = await draftService.cancel({ employeeId, draftNumber, conversationId });
      await recordInConversation(conversationId, `Rascunho ${draft.draftId} cancelado.`);
      return draft;
    },

    /** R16: edição pelo card; a linha de sistema leva a prioridade recalculada. */
    async edit(employeeId: string, draftNumber: number, changes: NewTicketInput) {
      const conversationId = await currentConversationId(employeeId, draftNumber);
      const draft = await draftService.edit({ employeeId, draftNumber, conversationId, changes });
      const priority = "ticket" in draft ? ` Prioridade: ${draft.ticket.priority}.` : "";
      await recordInConversation(
        conversationId,
        `Rascunho ${draft.draftId} editado pelo funcionário.${priority}`,
      );
      return draft;
    },
  };
}

export type DraftActions = ReturnType<typeof createDraftActions>;
