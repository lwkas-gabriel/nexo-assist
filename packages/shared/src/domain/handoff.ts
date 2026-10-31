import { computeDeadline } from "./sla.ts";
import type { TicketPriority } from "./ticket.ts";

/**
 * RN07: quando a conversa vai para um analista. O motivo vai no resumo e define o nível (A03).
 */
export const HANDOFF_REASONS = [
  "employee_request",
  "critical",
  "overdue",
  "low_confidence",
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  employee_request: "o funcionário pediu um analista",
  critical: "caso crítico",
  overdue: "chamado com prazo vencido",
  low_confidence: "o agent não teve segurança para resolver",
};

export const SUPPORT_LEVELS = ["N1", "N2"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

/** O que importa do chamado ligado para decidir o motivo, o nível e o prazo. */
export type HandoffTicket = { priority: TicketPriority; isOverdue: boolean };

/**
 * O motivo que fica registrado para o analista. "Prazo vencido" só vale se o chamado ligado está
 * mesmo vencido; senão, o agent errou o motivo e o registro diz o que dá para afirmar: o
 * funcionário pediu. Os outros motivos são julgamento do agent sobre a conversa e ficam como vieram.
 */
export function verifiedHandoffReason(
  reason: HandoffReason,
  ticket?: HandoffTicket,
): HandoffReason {
  if (reason === "overdue" && !ticket?.isOverdue) return "employee_request";
  return reason;
}

/**
 * A03: vai para o Suporte N2 o que é crítico, está vencido ou deixou o agent sem segurança. Decidido
 * pelo chamado, não só pelo motivo que o agent escolheu: um chamado vencido vai para o N2 mesmo que
 * o agent registre "o funcionário pediu". O resto vai para o N1.
 */
export function supportLevelFor(reason: HandoffReason, ticket?: HandoffTicket): SupportLevel {
  if (reason !== "employee_request") return "N2";
  return ticket?.priority === "critical" || ticket?.isOverdue ? "N2" : "N1";
}

/**
 * A02: até quando um analista fala com o funcionário. Caso crítico (pelo motivo ou pela prioridade
 * do chamado): 1 hora. Os demais: 4 horas úteis, o prazo de Alta. Um chamado médio vencido não pode
 * esperar mais 3 dias úteis só porque foi transferido (o protótipo mostra contato em até 2 h úteis).
 */
export function handoffResponseDue(
  reason: HandoffReason,
  ticketPriority: TicketPriority | undefined,
  now: Date,
): Date {
  const isCritical = reason === "critical" || ticketPriority === "critical";
  return computeDeadline(isCritical ? "critical" : "high", now);
}
