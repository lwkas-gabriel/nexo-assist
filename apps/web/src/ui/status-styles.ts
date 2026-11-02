import type { ConversationMode, TicketStatus } from "@nexo/shared/domain";

/**
 * Mapa único de status → cor (FRONTEND.md 10.2). Telas e componentes pedem o tom aqui, em vez de
 * escolher cores: mudar a cor de "aguardando analista" é mudar uma linha.
 */
export const TONES = ["warning", "danger", "success", "primary", "neutral"] as const;
export type Tone = (typeof TONES)[number];

/** Fundo suave e texto forte de cada tom, como nas pílulas do protótipo. */
export const TONE_CLASSES: Record<Tone, string> = {
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  success: "bg-success-soft text-success-text",
  primary: "bg-primary-soft text-primary-text",
  neutral: "bg-desk text-ink-3",
};

/** O ponto colorido que acompanha algumas pílulas ("Assistente online"). */
export const TONE_DOT_CLASSES: Record<Tone, string> = {
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
  primary: "bg-primary",
  neutral: "bg-ink-3",
};

/** Status do chamado. Aberto e esperando a TI chama atenção; fechado fica neutro. */
export const TICKET_STATUS_TONES: Record<TicketStatus, Tone> = {
  new: "primary",
  in_progress: "primary",
  waiting_analyst: "warning",
  approved: "primary",
  in_service: "primary",
  reopened: "warning",
  resolved: "neutral",
  cancelled: "neutral",
};

/** Estado da conversa, como no topo do chat e na lista do console. */
export const CONVERSATION_MODE_TONES: Record<ConversationMode, Tone> = {
  agent: "primary",
  waiting_analyst: "warning",
  analyst: "primary",
  closed: "neutral",
};

/**
 * Ponto da prioridade, como no protótipo. A api manda o rótulo já em português (o mesmo de
 * TICKET_PRIORITY_LABELS); rótulo desconhecido fica neutro.
 */
const PRIORITY_DOT_CLASSES: Record<string, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warning",
  Média: "bg-primary",
  Baixa: "bg-ink-3",
};

export function priorityDotClass(priorityLabel: string): string {
  return PRIORITY_DOT_CLASSES[priorityLabel] ?? "bg-ink-3";
}
