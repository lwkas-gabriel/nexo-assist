import { randomUUID } from "node:crypto";
import { MAX_UPDATE_MESSAGE_CHARS, type TicketDto } from "@nexo/shared/contracts";
import {
  HANDOFF_REASON_LABELS,
  formatBrasiliaDateTime,
  handoffResponseDue,
  isOpenStatus,
  parseTicketNumber,
  supportLevelFor,
  verifiedHandoffReason,
  type Clock,
  type HandoffReason,
  type HandoffTicket,
} from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { HandoffStore } from "../db/handoff-store.ts";
import type { HandoffRow } from "../db/schema.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { nextMode } from "./conversation-state.ts";
import type { DraftView } from "./draft-service.ts";
import { slaStatusOfTicket } from "./ticket-sla.ts";

type HandoffServiceDependencies = {
  conversationStore: ConversationStore;
  handoffStore: HandoffStore;
  ticketGateway: TicketGateway;
  clock: Clock;
};

/** R17: o resumo que o analista lê. O agent escreve; o motivo vem separado, de uma lista fixa. */
export type HandoffSummary = { problem: string; attempted: string };

/** Mesmo limite dos campos do resumo na tool: resumo, não cópia da conversa. */
export const HANDOFF_SUMMARY_FIELD_MAX_CHARS = 600;

export type HandoffRequest = {
  employeeId: string;
  conversationId: string;
  reason: HandoffReason;
  summary: HandoffSummary;
  ticketNumber?: string;
};

/** O chamado ligado, como foi possível descobrir. */
type LinkedTicket =
  | { status: "none" }
  | { status: "found"; ticket: TicketDto }
  /** O sistema de chamados não respondeu: o número fica registrado, sem prioridade nem prazo. */
  | { status: "unavailable"; number: string };

/**
 * Transferência para analista (RF16, RN07). O agent decide transferir e escreve o resumo; o código
 * confere o motivo, calcula o nível (A03) e o prazo (A02), muda o estado da conversa (o agent pausa,
 * RN08) e marca o chamado ligado como aguardando analista.
 */
export function createHandoffService({
  conversationStore,
  handoffStore,
  ticketGateway,
  clock,
}: HandoffServiceDependencies) {
  /** O chamado ligado, se for do funcionário. Uma falha aqui não impede a transferência. */
  async function linkedTicket(employeeId: string, ticketNumber?: string): Promise<LinkedTicket> {
    const number = ticketNumber ? parseTicketNumber(ticketNumber) : undefined;
    if (!number) return { status: "none" };
    try {
      return { status: "found", ticket: await ticketGateway.getTicket(employeeId, number) };
    } catch (error) {
      // De outra pessoa ou inexistente: não liga nada (RN09).
      if (error instanceof AppError && error.code === "NOT_FOUND") return { status: "none" };
      console.error(`Transferência sem consultar o chamado ${number}`, error);
      return { status: "unavailable", number };
    }
  }

  /**
   * Marca o chamado como aguardando analista, com o resumo. Qualquer falha fica no log: a conversa
   * já está com os analistas e o resumo já foi gravado, então nada aqui desfaz a transferência.
   */
  async function transferTicket(employeeId: string, ticket: TicketDto, row: HandoffRow) {
    if (!isOpenStatus(ticket.status)) return row;
    try {
      await ticketGateway.transferTicket(
        employeeId,
        ticket.number,
        describeSummary(row),
        `handoff:${row.id}`,
      );
      return await handoffStore.markTicketTransferred(row.id);
    } catch (error) {
      console.error(`Transferência sem atualizar o chamado ${ticket.number}`, error);
      return row;
    }
  }

  /** Transfere e devolve também a mensagem de sistema que avisou o funcionário. */
  async function transfer(request: HandoffRequest) {
    const conversation = await conversationStore.findById(request.conversationId);
    if (!conversation || conversation.employeeId !== request.employeeId) {
      throw new AppError("NOT_FOUND", "Conversa não encontrada.");
    }
    const mode = nextMode(conversation.mode, "handoff");

    const linked = await linkedTicket(request.employeeId, request.ticketNumber);
    const now = clock.now();
    const ticketFacts = linked.status === "found" ? handoffTicket(linked.ticket, now) : undefined;
    const reason = verifiedHandoffReason(request.reason, ticketFacts);

    const moved = await conversationStore.changeMode(conversation, {
      mode,
      assignedAnalystId: null,
      now,
    });
    if (!moved) throw new AppError("CONFLICT", "A conversa mudou de estado; tente de novo.");

    // Logo depois da troca de estado, só gravações locais: o resumo e o aviso na conversa.
    // O sistema de chamados, que pode falhar, fica por último.
    const created = await handoffStore.create({
      id: randomUUID(),
      conversationId: conversation.id,
      reason,
      supportLevel: supportLevelFor(reason, ticketFacts),
      problem: request.summary.problem,
      attempted: request.summary.attempted,
      ticketNumber: linkedNumber(linked),
      ticketTransferred: false,
      responseDueAt: handoffResponseDue(reason, ticketFacts?.priority, now),
      createdAt: now,
    });
    const notice = await conversationStore.appendMessage({
      conversationId: conversation.id,
      author: "system",
      authorId: null,
      parts: [{ type: "text", text: handoffLine(created) }],
      createdAt: clock.now(),
    });

    const row =
      linked.status === "found"
        ? await transferTicket(request.employeeId, linked.ticket, created)
        : created;
    return { view: toHandoffView(row), notice: { id: notice.id, text: handoffLine(created) } };
  }

  async function handoff(request: HandoffRequest) {
    return (await transfer(request)).view;
  }

  return {
    handoff,
    transfer,

    /**
     * A04: caso crítico transfere direto, avisando. Chamado crítico recém-criado leva a conversa
     * para o N2 sem depender de o agent lembrar disso. O chamado já existe: se a transferência
     * falhar, a confirmação continua valendo e o resultado diz que a transferência não aconteceu.
     */
    async escalateNewCriticalTicket(request: {
      employeeId: string;
      conversationId: string;
      draft: Pick<DraftView, "kind">;
      ticket: Pick<TicketDto, "number" | "priority" | "title" | "description">;
    }): Promise<{ handoff: HandoffView | null; escalationFailed: boolean }> {
      const { draft, ticket } = request;
      if (draft.kind !== "create" || ticket.priority !== "critical") {
        return { handoff: null, escalationFailed: false };
      }
      const conversation = await conversationStore.findById(request.conversationId);
      // Já transferida (por exemplo, o agent transferiu no mesmo passo): nada a fazer.
      if (conversation?.mode !== "agent") return { handoff: null, escalationFailed: false };
      try {
        const handoffView = await handoff({
          employeeId: request.employeeId,
          conversationId: request.conversationId,
          reason: "critical",
          ticketNumber: ticket.number,
          summary: {
            problem: truncate(
              `${ticket.title}. ${ticket.description}`,
              HANDOFF_SUMMARY_FIELD_MAX_CHARS,
            ),
            attempted: `Chamado ${ticket.number} aberto pelo chat com prioridade Crítica.`,
          },
        });
        return { handoff: handoffView, escalationFailed: false };
      } catch (error) {
        // Corrida com outra transferência: a conversa já está com os analistas.
        if (error instanceof AppError && error.code === "CONFLICT") {
          return { handoff: null, escalationFailed: false };
        }
        console.error(`Chamado crítico ${ticket.number} criado sem transferência`, error);
        return { handoff: null, escalationFailed: true };
      }
    },
  };
}

export type HandoffService = ReturnType<typeof createHandoffService>;

/** O que o nível de suporte precisa saber do chamado ligado (A03). */
function handoffTicket(ticket: TicketDto, now: Date): HandoffTicket {
  const sla = slaStatusOfTicket(ticket, now);
  return { priority: ticket.priority, isOverdue: sla.isTracked && sla.isOverdue };
}

function linkedNumber(linked: LinkedTicket): string | null {
  if (linked.status === "found") return linked.ticket.number;
  if (linked.status === "unavailable") return linked.number;
  return null;
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

/** O resumo como vai para o histórico do chamado, dentro do limite de uma atualização. */
function describeSummary(row: HandoffRow): string {
  const text = `Motivo: ${HANDOFF_REASON_LABELS[row.reason]}. Problema: ${row.problem} Já tentado: ${row.attempted}`;
  return truncate(text, MAX_UPDATE_MESSAGE_CHARS);
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

function handoffLine(row: HandoffRow): string {
  const view = toHandoffView(row);
  return `Conversa transferida para o Suporte ${view.supportLevel} (${view.reason}). Um analista fala com você até ${view.responseBy}.`;
}
