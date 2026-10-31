import type { ConversationMode } from "@nexo/shared/domain";
import type { UIMessage } from "ai";
import { apiRequest } from "../../lib/api-client.ts";

/** RF10: contador da sessão atual e resumo da anterior (null antes da primeira mensagem). */
export type SessionView = {
  agentMessages: number;
  limit: number;
  isAtLimit: boolean;
  /** Início da sessão; null quando a próxima mensagem é que vai abri-la. */
  startedAt: string | null;
  previousSummary: string | null;
};

export type DraftStatus = "pending" | "confirming" | "confirm_failed" | "confirmed" | "cancelled";

/** Campos do rascunho em código, para o formulário de edição (R16). */
export type DraftFields = {
  title: string;
  description: string;
  type: string;
  category: string;
  affected: string;
  urgency: string;
};

/** Rascunho como a api devolve: chamado novo (com os campos) ou complemento a um existente. */
export type DraftView = {
  draftId: string;
  number: number;
  kind: "create" | "update" | "reopen";
  status: DraftStatus;
  ticketNumber: string | null;
  ticket?: {
    title: string;
    description: string;
    type: string;
    category: string;
    affected: string;
    priority: string;
    priorityReason: string | null;
    slaRule: string;
    firstResponseBy: string;
  };
  fields?: DraftFields;
  update?: { message: string };
};

export type ConversationView = {
  conversation: { id: string; mode: ConversationMode } | null;
  session: SessionView | null;
  messages: UIMessage[];
  /** Estado atual dos rascunhos: o card mostra o que aconteceu depois de proposto (RF07). */
  drafts: DraftView[];
};

/** Conversa em andamento do funcionário, com o histórico guardado no servidor. */
export function fetchConversation(): Promise<ConversationView> {
  return apiRequest<ConversationView>("/chat");
}

/** Botões do card (RN04, R16): ações determinísticas, sem passar pelo modelo. */
export function confirmDraft(draftNumber: number) {
  return apiRequest<unknown>(`/chat/drafts/${draftNumber}/confirm`, { method: "POST" });
}

export function cancelDraft(draftNumber: number) {
  return apiRequest<unknown>(`/chat/drafts/${draftNumber}/cancel`, { method: "POST" });
}

export function editDraft(draftNumber: number, changes: Partial<DraftFields>) {
  return apiRequest<unknown>(`/chat/drafts/${draftNumber}`, { method: "PATCH", body: changes });
}

/** RN14: encerra a sessão atual (com resumo) e abre outra. */
export function startNewSession() {
  return apiRequest<unknown>("/chat/sessions", { method: "POST" });
}

/** "Falar com um analista" pelo botão, sem o agent (vale também no limite da sessão). */
export function requestAnalyst() {
  return apiRequest<unknown>("/chat/handoff", { method: "POST" });
}
