import type { UIMessage } from "ai";
import { apiRequest } from "../../lib/api-client.ts";

export type ConversationView = {
  conversation: { id: string; mode: string } | null;
  messages: UIMessage[];
};

/** Conversa em andamento do funcionário, com o histórico guardado no servidor. */
export function fetchConversation(): Promise<ConversationView> {
  return apiRequest<ConversationView>("/chat");
}
