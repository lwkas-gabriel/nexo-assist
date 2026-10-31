import { NEXO_BUSINESS_CALENDAR, type BusinessCalendar } from "./business-calendar.ts";
import { isOpenStatus, type TicketPriority, type TicketStatus } from "./ticket.ts";

/**
 * RN12: prazo por prioridade, para a primeira resposta e para cada atualização.
 * Crítica conta em horas corridas (plantão 24 h); as demais, em horário útil.
 * Suposição A24: "N dias úteis" = N dias úteis completos de expediente (N × 10 h úteis).
 */
type SlaRule =
  | { kind: "continuous"; minutes: number }
  | { kind: "business"; minutes: number }
  | { kind: "businessDays"; days: number };

export const SLA_RULES: Record<TicketPriority, SlaRule> = {
  critical: { kind: "continuous", minutes: 60 },
  high: { kind: "business", minutes: 4 * 60 },
  medium: { kind: "businessDays", days: 3 },
  low: { kind: "businessDays", days: 5 },
};

/** Como o prazo é dito ao funcionário ("acima do prazo de 3 dias úteis"). */
export const SLA_LABELS: Record<TicketPriority, string> = {
  critical: "1 hora",
  high: "4 horas úteis",
  medium: "3 dias úteis",
  low: "5 dias úteis",
};

const MINUTE_MS = 60_000;

/** Prazo da próxima resposta, contado a partir de `from`. */
export function computeDeadline(
  priority: TicketPriority,
  from: Date,
  calendar: BusinessCalendar = NEXO_BUSINESS_CALENDAR,
): Date {
  const rule = SLA_RULES[priority];
  switch (rule.kind) {
    case "continuous":
      return new Date(from.getTime() + rule.minutes * MINUTE_MS);
    case "business":
      return calendar.addBusinessMinutes(from, rule.minutes);
    case "businessDays":
      return calendar.addBusinessMinutes(from, rule.days * calendar.businessDayMinutes);
  }
}

export type SlaTrackedTicket = {
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  /** Última atualização da equipe de TI. Complemento do funcionário não conta (A17). */
  lastStaffUpdateAt?: Date;
};

export type SlaStatus =
  { isTracked: false } | { isTracked: true; deadline: Date; isOverdue: boolean };

/**
 * A partir de quando o prazo conta (RN12, A17): da última atualização da equipe de TI ou,
 * se ela ainda não respondeu, da abertura (prazo da primeira resposta).
 */
export function slaClockStart(
  ticket: Pick<SlaTrackedTicket, "createdAt" | "lastStaffUpdateAt">,
): Date {
  return ticket.lastStaffUpdateAt ?? ticket.createdAt;
}

/**
 * Situação do prazo de um chamado: só chamados abertos têm prazo.
 * Passado o prazo sem resposta da TI, o chamado está vencido (e pode ser transferido, RN07).
 */
export function getSlaStatus(
  ticket: SlaTrackedTicket,
  now: Date,
  calendar: BusinessCalendar = NEXO_BUSINESS_CALENDAR,
): SlaStatus {
  if (!isOpenStatus(ticket.status)) {
    return { isTracked: false };
  }

  const deadline = computeDeadline(ticket.priority, slaClockStart(ticket), calendar);
  return { isTracked: true, deadline, isOverdue: now.getTime() > deadline.getTime() };
}
