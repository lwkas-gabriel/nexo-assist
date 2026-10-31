import type { TicketDto } from "@nexo/shared/contracts";
import { getSlaStatus, type SlaStatus, type SlaTrackedTicket } from "@nexo/shared/domain";

/** O chamado como as regras de prazo (RN12) o leem: datas em texto viram Date. */
export function toSlaTrackedTicket(ticket: TicketDto): SlaTrackedTicket {
  const lastStaffUpdateAt = ticket.lastStaffUpdateAt
    ? new Date(ticket.lastStaffUpdateAt)
    : undefined;
  return {
    status: ticket.status,
    priority: ticket.priority,
    createdAt: new Date(ticket.createdAt),
    ...(lastStaffUpdateAt ? { lastStaffUpdateAt } : {}),
  };
}

export function slaStatusOfTicket(ticket: TicketDto, now: Date): SlaStatus {
  return getSlaStatus(toSlaTrackedTicket(ticket), now);
}
