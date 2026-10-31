import type { TicketDto, UpdateAuthor } from "@nexo/shared/contracts";
import {
  SLA_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  checkReopen,
  describeElapsed,
  formatBrasiliaDateTime,
  getSlaStatus,
  isOpenStatus,
  slaClockStart,
} from "@nexo/shared/domain";
import { toSlaTrackedTicket } from "../app/ticket-sla.ts";

/** Quantas atualizações recentes o agent vê ao consultar um chamado (contexto sem desperdício). */
const RECENT_UPDATES = 5;

/** Quem escreveu cada atualização, como o funcionário entende. Um autor novo quebra a compilação aqui. */
const UPDATE_AUTHOR_LABELS: Record<UpdateAuthor, string> = {
  staff: "equipe de TI",
  employee: "funcionário",
  agent: "Nexo Assist",
  system: "sistema",
};

/**
 * Chamado do jeito que o agent precisa para responder: rótulos em português, datas em Brasília
 * e o prazo já calculado pelas regras do domínio (RN12). O agent não faz conta nem converte fuso.
 */
export function toTicketSummary(ticket: TicketDto, now: Date) {
  const slaTicket = toSlaTrackedTicket(ticket);
  const { createdAt, lastStaffUpdateAt } = slaTicket;
  const sla = getSlaStatus(slaTicket, now);

  return {
    number: ticket.number,
    title: ticket.title,
    type: TICKET_TYPE_LABELS[ticket.type],
    category: TICKET_CATEGORY_LABELS[ticket.category],
    priority: TICKET_PRIORITY_LABELS[ticket.priority],
    status: TICKET_STATUS_LABELS[ticket.status],
    isOpen: isOpenStatus(ticket.status),
    openedAt: formatBrasiliaDateTime(createdAt),
    // null quando a TI ainda não respondeu: o agent não pode inventar uma atualização.
    lastTeamUpdateAt: lastStaffUpdateAt ? formatBrasiliaDateTime(lastStaffUpdateAt) : null,
    // Desde a última resposta da TI ou, sem resposta, desde a abertura (A17).
    timeWithoutTeamResponse: describeElapsed(slaClockStart(slaTicket), now),
    deadline: sla.isTracked
      ? {
          rule: SLA_LABELS[ticket.priority],
          dueAt: formatBrasiliaDateTime(sla.deadline),
          isOverdue: sla.isOverdue,
        }
      : null,
    canReopen: checkReopen(
      {
        status: ticket.status,
        ...(ticket.resolvedAt ? { resolvedAt: new Date(ticket.resolvedAt) } : {}),
      },
      now,
    ).canReopen,
  };
}

/** Consulta de um chamado: o resumo mais a descrição e as atualizações recentes. */
export function toTicketDetails(ticket: TicketDto, now: Date) {
  return {
    ...toTicketSummary(ticket, now),
    description: ticket.description,
    recentUpdates: ticket.updates.slice(-RECENT_UPDATES).map((update) => ({
      by: UPDATE_AUTHOR_LABELS[update.author],
      at: formatBrasiliaDateTime(new Date(update.createdAt)),
      message: update.message,
    })),
  };
}
