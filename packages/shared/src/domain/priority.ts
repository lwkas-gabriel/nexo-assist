import {
  AFFECTED_SCOPE_LABELS,
  TICKET_PRIORITY_LABELS,
  type AffectedScope,
  type TicketPriority,
} from "./ticket.ts";

/**
 * Urgência: se há trabalho parado ou compromisso em risco (RN11).
 * O agent extrai isso da conversa; a prioridade sai da matriz abaixo, não do LLM.
 */
export const URGENCY_LEVELS = [
  "blocked",
  "deadline_today",
  "has_workaround",
  "no_urgency",
] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABELS: Record<Urgency, string> = {
  blocked: "parado, sem alternativa",
  deadline_today: "compromisso hoje",
  has_workaround: "atrapalha, mas há alternativa",
  no_urgency: "pedido sem urgência",
};

/**
 * RN11: prioridade = impacto (quantos são afetados) × urgência. Tabela do plano, seção 6 (A06):
 *
 * | Impacto \ Urgência | Parado      | Compromisso hoje | Há alternativa | Sem urgência |
 * |--------------------|-------------|------------------|----------------|--------------|
 * | Empresa / equipe   | Crítica     | Crítica          | Alta           | Média        |
 * | Só eu              | Alta        | Alta             | Média          | Baixa        |
 *
 * Fronteiras (A06): equipe com alternativa sobe um nível em relação a uma pessoa só.
 */
const GROUP_PRIORITY: Record<Urgency, TicketPriority> = {
  blocked: "critical",
  deadline_today: "critical",
  has_workaround: "high",
  no_urgency: "medium",
};

const INDIVIDUAL_PRIORITY: Record<Urgency, TicketPriority> = {
  blocked: "high",
  deadline_today: "high",
  has_workaround: "medium",
  no_urgency: "low",
};

export type PriorityDecision = {
  priority: TicketPriority;
  /** Justificativa legível, exibida no registro de decisão (transparência). */
  reason: string;
};

export function classifyPriority(affected: AffectedScope, urgency: Urgency): PriorityDecision {
  const isGroup = affected !== "just_me";
  const priority = isGroup ? GROUP_PRIORITY[urgency] : INDIVIDUAL_PRIORITY[urgency];

  return {
    priority,
    reason: `RN11: ${AFFECTED_SCOPE_LABELS[affected].toLowerCase()} + ${URGENCY_LABELS[urgency]} → ${TICKET_PRIORITY_LABELS[priority]}`,
  };
}
