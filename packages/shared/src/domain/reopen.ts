import type { TicketStatus } from "./ticket.ts";

/** RN06: chamados resolvidos há até 7 dias podem ser reabertos; depois disso, abre-se um novo. */
export const REOPEN_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReopenableTicket = {
  status: TicketStatus;
  resolvedAt?: Date;
};

export type ReopenCheck =
  { canReopen: true } | { canReopen: false; reason: "not_resolved" | "window_expired" };

export function checkReopen(ticket: ReopenableTicket, now: Date): ReopenCheck {
  if (ticket.status !== "resolved") {
    return { canReopen: false, reason: "not_resolved" };
  }
  // Sem data de resolução não há como provar a janela: abrir um chamado novo é o caminho seguro.
  if (!ticket.resolvedAt) {
    return { canReopen: false, reason: "window_expired" };
  }

  const elapsedMs = now.getTime() - ticket.resolvedAt.getTime();
  return elapsedMs <= REOPEN_WINDOW_DAYS * DAY_MS
    ? { canReopen: true }
    : { canReopen: false, reason: "window_expired" };
}
