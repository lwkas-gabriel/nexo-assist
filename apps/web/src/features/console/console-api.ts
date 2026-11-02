import { CONSOLE_FILTERS, type ConsoleFilter } from "@nexo/shared/contracts";
import type { ConversationMode } from "@nexo/shared/domain";
import type { UIMessage } from "ai";
import { apiRequest } from "../../lib/api-client.ts";
import type { AnalystView, DraftView } from "../chat/chat-api.ts";
import type { TicketSummaryView } from "../chat/ticket-model.ts";

export { CONSOLE_FILTERS, type ConsoleFilter };

/** Estado da conversa, como a etiqueta da lista e o topo da conversa mostram (tela 4). */
export type ConsoleConversationState =
  | {
      kind: "waiting";
      reason: string;
      ticketNumber: string | null;
      /** Null se a transferência não chegou a ser gravada. */
      responseDueAt: string | null;
      confidence: number | null;
    }
  | { kind: "analyst"; byMe: boolean; analyst: AnalystView | null }
  | { kind: "agent" };

export type ConsoleEmployee = { name: string; department: string; isOnline: boolean };

export type ConsoleListItem = {
  id: string;
  employee: ConsoleEmployee;
  state: ConsoleConversationState;
  updatedAt: string;
  lastMessage: {
    author: string;
    text: string;
    createdAt: string;
    seenByEmployee: boolean | null;
  } | null;
  unread: number;
};

export type ConsoleList = {
  counts: Record<ConsoleFilter, number>;
  conversations: ConsoleListItem[];
};

export type ConsoleConversation = {
  conversation: {
    id: string;
    mode: ConversationMode;
    version: number;
    employee: ConsoleEmployee;
    state: ConsoleConversationState;
    handoff: {
      reason: string;
      supportLevel: string;
      problem: string;
      attempted: string;
      ticketNumber: string | null;
      responseDueAt: string;
    } | null;
  };
  messages: UIMessage[];
  /** Os rascunhos da conversa, no estado atual: os cards que o funcionário viu (RF19). */
  drafts: DraftView[];
};

export type ConsoleTickets = {
  employeeName: string;
  openCount: number;
  closedCount: number;
  thisConversation: TicketSummaryView[];
  others: TicketSummaryView[];
};

/** RF18: a lista com o filtro e a busca; a contagem vem de todos os filtros. */
export function fetchConsoleList(filter: ConsoleFilter, query: string): Promise<ConsoleList> {
  const params = new URLSearchParams({ filter, q: query });
  return apiRequest<ConsoleList>(`/console/conversations?${params.toString()}`);
}

export function fetchConsoleConversation(id: string): Promise<ConsoleConversation> {
  return apiRequest<ConsoleConversation>(`/console/conversations/${encodeURIComponent(id)}`);
}

export function fetchConsoleTickets(id: string): Promise<ConsoleTickets> {
  return apiRequest<ConsoleTickets>(`/console/conversations/${encodeURIComponent(id)}/tickets`);
}

/** Tela 5 (RF20): assumir, responder, devolver ao agent e encerrar o atendimento. */
export function assumeConversation(id: string) {
  return apiRequest<unknown>(`/console/conversations/${encodeURIComponent(id)}/assume`, {
    method: "POST",
  });
}

export function replyToConversation(id: string, text: string) {
  return apiRequest<unknown>(`/console/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: { text },
  });
}

export function releaseConversation(id: string) {
  return apiRequest<unknown>(`/console/conversations/${encodeURIComponent(id)}/release`, {
    method: "POST",
  });
}

/** A08: encerra o atendimento (não o chamado); a conversa volta ao agent com sessão nova. */
export function closeService(id: string) {
  return apiRequest<unknown>(`/console/conversations/${encodeURIComponent(id)}/close`, {
    method: "POST",
  });
}
