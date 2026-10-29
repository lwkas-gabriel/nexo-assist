/**
 * Vocabulário do service desk (Anexo A do PRD): tipos, categorias, prioridades, afetados e status.
 * Cada lista é a única fonte dos valores válidos; os tipos TypeScript são derivados dela.
 */

/** RN01: incidente quando algo parou ou não funciona; requisição para pedidos de acesso, equipamento ou software. */
export const TICKET_TYPES = ["incident", "request"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  incident: "Incidente",
  request: "Requisição",
};

/** Prefixo do número do chamado (INC-20311, REQ-10442). */
export const TICKET_NUMBER_PREFIXES: Record<TicketType, string> = {
  incident: "INC",
  request: "REQ",
};

/** RN02: as seis categorias do service desk. */
export const TICKET_CATEGORIES = [
  "access",
  "network_vpn",
  "hardware",
  "software",
  "email",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  access: "Acesso",
  network_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  other: "Outros",
};

/** Da mais à menos urgente. A regra que escolhe a prioridade é a matriz da RN11 (T05). */
export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

/**
 * Quem é afetado (RN03), que define o impacto na prioridade (RN11).
 * "Não sei", opção do protótipo, não é um valor: o agent pergunta de novo ou explica a dúvida.
 */
export const AFFECTED_SCOPES = ["just_me", "my_team", "whole_company"] as const;
export type AffectedScope = (typeof AFFECTED_SCOPES)[number];

export const AFFECTED_SCOPE_LABELS: Record<AffectedScope, string> = {
  just_me: "Somente você",
  my_team: "Sua equipe",
  whole_company: "Toda a empresa",
};

/**
 * Status do chamado (suposição A12). "Em atendimento" é quando um analista assume a conversa (tela 5).
 * As transições entre eles ficam na máquina de estados do chamado (ARCHITECTURE 11.3).
 */
export const OPEN_TICKET_STATUSES = [
  "new",
  "in_progress",
  "waiting_analyst",
  "approved",
  "in_service",
  "reopened",
] as const;
export const CLOSED_TICKET_STATUSES = ["resolved", "cancelled"] as const;
export const TICKET_STATUSES = [...OPEN_TICKET_STATUSES, ...CLOSED_TICKET_STATUSES] as const;

export type OpenTicketStatus = (typeof OPEN_TICKET_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Novo",
  in_progress: "Em andamento",
  waiting_analyst: "Aguardando analista",
  approved: "Aprovado",
  in_service: "Em atendimento",
  reopened: "Reaberto",
  resolved: "Resolvido",
  cancelled: "Cancelado",
};

const OPEN_STATUS_SET: ReadonlySet<TicketStatus> = new Set(OPEN_TICKET_STATUSES);

/** Chamado aberto ainda pode ser atualizado (RN05) e conta prazo (RN12). */
export function isOpenStatus(status: TicketStatus): status is OpenTicketStatus {
  return OPEN_STATUS_SET.has(status);
}

/** Número do chamado: prefixo do tipo + 5 dígitos (INC-20311). */
const TICKET_NUMBER_PATTERN = /^(INC|REQ)-(\d{5})$/;

export function formatTicketNumber(type: TicketType, sequence: number): string {
  return `${TICKET_NUMBER_PREFIXES[type]}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Lê um número de chamado escrito pelo funcionário ("inc 20311", "INC-20311").
 * Devolve o formato canônico, ou undefined se não for um número válido.
 */
export function parseTicketNumber(text: string): string | undefined {
  const normalized = text.trim().toUpperCase().replace(/\s+|_/g, "-");
  return TICKET_NUMBER_PATTERN.test(normalized) ? normalized : undefined;
}

export function ticketTypeFromNumber(ticketNumber: string): TicketType | undefined {
  const prefix = TICKET_NUMBER_PATTERN.exec(ticketNumber)?.[1];
  if (prefix === "INC") return "incident";
  if (prefix === "REQ") return "request";
  return undefined;
}
