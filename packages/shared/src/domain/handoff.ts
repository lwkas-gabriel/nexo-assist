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

/**
 * A03: crítico, vencido ou sem segurança do agent vão para o Suporte N2. Pedido do funcionário
 * vai para o N1, a não ser que o chamado ligado seja crítico.
 */
export function supportLevelFor(
  reason: HandoffReason,
  ticketPriority?: TicketPriority,
): SupportLevel {
  if (reason !== "employee_request") return "N2";
  return ticketPriority === "critical" ? "N2" : "N1";
}

/** A02: sem chamado ligado, o analista responde no prazo de uma prioridade Alta. */
const DEFAULT_HANDOFF_PRIORITY: TicketPriority = "high";

/**
 * A02: até quando um analista fala com o funcionário. Usa o SLA da prioridade do chamado ligado;
 * sem chamado, o de prioridade Alta (4 horas úteis).
 */
export function handoffResponseDue(ticketPriority: TicketPriority | undefined, now: Date): Date {
  return computeDeadline(ticketPriority ?? DEFAULT_HANDOFF_PRIORITY, now);
}
