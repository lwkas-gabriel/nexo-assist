import { randomUUID } from "node:crypto";
import type { TicketDto } from "@nexo/shared/contracts";
import {
  HANDOFF_REASON_LABELS,
  formatBrasiliaDateTime,
  handoffResponseDue,
  isOpenStatus,
  parseTicketNumber,
  supportLevelFor,
  type Clock,
  type HandoffReason,
} from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { HandoffStore } from "../db/handoff-store.ts";
import type { HandoffRow } from "../db/schema.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { nextMode } from "./conversation-state.ts";

type HandoffServiceDependencies = {
  conversationStore: ConversationStore;
  handoffStore: HandoffStore;
  ticketGateway: TicketGateway;
  clock: Clock;
};

/** R17: o resumo que o analista lê. O agent escreve; o motivo vem separado, de uma lista fixa. */
export type HandoffSummary = { problem: string; attempted: string };

export type HandoffRequest = {
  employeeId: string;
  conversationId: string;
  reason: HandoffReason;
  summary: HandoffSummary;
  ticketNumber?: string;
};

/**
 * Transferência para analista (RF16, RN07). O agent decide transferir e escreve o resumo; o código
 * calcula o nível (A03) e o prazo (A02), muda o estado da conversa (o agent pausa, RN08) e marca o
 * chamado ligado como aguardando analista.
 */
export function createHandoffService({
  conversationStore,
  handoffStore,
  ticketGateway,
  clock,
}: HandoffServiceDependencies) {
  /** O chamado ligado, se existir e for do funcionário. Uma falha aqui não impede a transferência. */
  async function linkedTicket(employeeId: string, ticketNumber: string | undefined) {
    const number = ticketNumber ? parseTicketNumber(ticketNumber) : undefined;
    if (!number) return undefined;
    try {
      return await ticketGateway.getTicket(employeeId, number);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return undefined;
    }
  }

  /**
   * Marca o chamado como aguardando analista, com o resumo. Se o sistema de chamados estiver fora,
   * a conversa vai para o analista mesmo assim: falar com uma pessoa importa mais (o resultado avisa).
   */
  async function transferTicket(
    employeeId: string,
    ticket: TicketDto | undefined,
    handoffId: string,
    summaryText: string,
  ): Promise<boolean> {
    if (!ticket || !isOpenStatus(ticket.status)) return false;
    try {
      await ticketGateway.transferTicket(
        employeeId,
        ticket.number,
        summaryText,
        `handoff:${handoffId}`,
      );
      return true;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      console.error(`Transferência sem atualizar o chamado ${ticket.number}`, error);
      return false;
    }
  }

  async function handoff(request: HandoffRequest) {
    const conversation = await conversationStore.findById(request.conversationId);
    if (!conversation || conversation.employeeId !== request.employeeId) {
      throw new AppError("NOT_FOUND", "Conversa não encontrada.");
    }
    const mode = nextMode(conversation.mode, "handoff");

    const ticket = await linkedTicket(request.employeeId, request.ticketNumber);
    const now = clock.now();
    const moved = await conversationStore.changeMode(conversation, {
      mode,
      assignedAnalystId: null,
      now,
    });
    if (!moved) throw new AppError("CONFLICT", "A conversa mudou de estado; tente de novo.");

    const id = randomUUID();
    const supportLevel = supportLevelFor(request.reason, ticket?.priority);
    const summaryText = describeSummary(request.reason, request.summary);
    const ticketTransferred = await transferTicket(request.employeeId, ticket, id, summaryText);
    const row = await handoffStore.create({
      id,
      conversationId: conversation.id,
      reason: request.reason,
      supportLevel,
      problem: request.summary.problem,
      attempted: request.summary.attempted,
      ticketNumber: ticket?.number ?? null,
      ticketTransferred,
      responseDueAt: handoffResponseDue(ticket?.priority, now),
      createdAt: now,
    });

    const view = toHandoffView(row);
    await conversationStore.appendMessage({
      conversationId: conversation.id,
      author: "system",
      authorId: null,
      parts: [{ type: "text", text: handoffLine(view) }],
      createdAt: clock.now(),
    });
    return view;
  }

  return {
    handoff,

    /**
     * A04: caso crítico transfere direto, avisando. Chamado crítico recém-criado leva a conversa
     * para o N2 sem depender de o agent lembrar disso.
     */
    async escalateIfCritical(request: {
      employeeId: string;
      conversationId: string;
      ticket: Pick<TicketDto, "number" | "priority" | "title" | "description">;
    }) {
      if (request.ticket.priority !== "critical") return null;
      const conversation = await conversationStore.findById(request.conversationId);
      if (conversation?.mode !== "agent") return null;
      return handoff({
        employeeId: request.employeeId,
        conversationId: request.conversationId,
        reason: "critical",
        ticketNumber: request.ticket.number,
        summary: {
          problem: `${request.ticket.title}. ${request.ticket.description}`,
          attempted: `Chamado ${request.ticket.number} aberto pelo chat com prioridade Crítica.`,
        },
      });
    },
  };
}

export type HandoffService = ReturnType<typeof createHandoffService>;

function describeSummary(reason: HandoffReason, summary: HandoffSummary): string {
  return `Motivo: ${HANDOFF_REASON_LABELS[reason]}. Problema: ${summary.problem} Já tentado: ${summary.attempted}`;
}

export function toHandoffView(row: HandoffRow) {
  return {
    supportLevel: row.supportLevel,
    reason: HANDOFF_REASON_LABELS[row.reason],
    ticketNumber: row.ticketNumber,
    ticketTransferred: row.ticketTransferred,
    responseBy: formatBrasiliaDateTime(row.responseDueAt),
  };
}

export type HandoffView = ReturnType<typeof toHandoffView>;

function handoffLine(view: HandoffView): string {
  return `Conversa transferida para o Suporte ${view.supportLevel} (${view.reason}). Um analista fala com você até ${view.responseBy}.`;
}
