import type { TicketDto } from "@nexo/shared/contracts";
import {
  SLA_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  checkReopen,
  formatBrasiliaDateTime,
  getSlaStatus,
  isOpenStatus,
  wholeDaysSince,
} from "@nexo/shared/domain";

/** Quantas atualizações recentes o agent vê ao consultar um chamado (contexto sem desperdício). */
const RECENT_UPDATES = 5;

/**
 * Chamado do jeito que o agent precisa para responder: rótulos em português, datas em Brasília
 * e o prazo já calculado pelas regras do domínio (RN12). O agent não faz conta nem converte fuso.
 */
export function toTicketSummary(ticket: TicketDto, now: Date) {
  const createdAt = new Date(ticket.createdAt);
  const lastStaffUpdateAt = ticket.lastStaffUpdateAt ? new Date(ticket.lastStaffUpdateAt) : null;
  const lastUpdate = lastStaffUpdateAt ?? createdAt;
  const sla = getSlaStatus(
    {
      status: ticket.status,
      priority: ticket.priority,
      createdAt,
      ...(lastStaffUpdateAt ? { lastStaffUpdateAt } : {}),
    },
    now,
  );

  return {
    number: ticket.number,
    title: ticket.title,
    type: TICKET_TYPE_LABELS[ticket.type],
    category: TICKET_CATEGORY_LABELS[ticket.category],
    priority: TICKET_PRIORITY_LABELS[ticket.priority],
    status: TICKET_STATUS_LABELS[ticket.status],
    isOpen: isOpenStatus(ticket.status),
    openedAt: formatBrasiliaDateTime(createdAt),
    lastTeamUpdateAt: formatBrasiliaDateTime(lastUpdate),
    daysWithoutTeamUpdate: wholeDaysSince(lastUpdate, now),
    deadline: sla.isTracked
      ? {
          rule: SLA_LABELS[ticket.priority],
          dueAt: formatBrasiliaDateTime(sla.deadline),
          isOverdue: sla.isOverdue,
        }
      : null,
    canReopen: ticket.resolvedAt
      ? checkReopen({ status: ticket.status, resolvedAt: new Date(ticket.resolvedAt) }, now)
          .canReopen
      : false,
  };
}

/** Consulta de um chamado: o resumo mais a descrição e as atualizações recentes. */
export function toTicketDetails(ticket: TicketDto, now: Date) {
  return {
    ...toTicketSummary(ticket, now),
    description: ticket.description,
    recentUpdates: ticket.updates.slice(-RECENT_UPDATES).map((update) => ({
      by:
        update.author === "staff"
          ? "equipe de TI"
          : update.author === "employee"
            ? "funcionário"
            : "sistema",
      at: formatBrasiliaDateTime(new Date(update.createdAt)),
      message: update.message,
    })),
  };
}
