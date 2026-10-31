import type { ConversationMode } from "@nexo/shared/domain";
import type { UIMessage } from "ai";
import { apiRequest } from "../../lib/api-client.ts";
import type { AnalystView } from "../chat/chat-api.ts";
import type { TicketSummaryView } from "../chat/ticket-model.ts";

export const CONSOLE_FILTERS = ["all", "for_you", "with_agent", "mine"] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];

/** Estado da conversa, como a etiqueta da lista e o topo da conversa mostram (tela 4). */
export type ConsoleConversationState =
  | {
      kind: "waiting";
      reason: string;
      ticketNumber: string | null;
      responseDueAt: string;
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
