import type { ChatSessionRow, ConversationRow } from "../db/schema.ts";
import { agentMayReply } from "./conversation-state.ts";

/** RN14: mensagens do funcionário ao agent por sessão. */
export const SESSION_MESSAGE_LIMIT = 30;

/** A05: sem atividade por mais que isto, a próxima mensagem abre uma sessão nova. */
export const SESSION_INACTIVITY_MS = 8 * 60 * 60 * 1000;

/**
 * Regra da sessão (11.3): `active` → `ended`, por limite e pedido de nova sessão, ou por
 * inatividade. A inatividade conta a última atividade da conversa toda (mensagens de qualquer
 * autor, transferência, devolução), não só as do funcionário: assim, voltar depois de o analista
 * devolver a conversa não descarta o que ele escreveu (R18).
 */
export function isSessionExpired(
  session: Pick<ChatSessionRow, "agentMessages" | "lastActivityAt">,
  conversation: Pick<ConversationRow, "mode" | "updatedAt">,
  now: Date,
): boolean {
  // Sessão vazia não expira: encerrá-la só trocaria o resumo verdadeiro por um vazio (R03).
  if (session.agentMessages === 0) return false;
  // R41: com a conversa com um analista, a sessão não expira.
  if (!agentMayReply(conversation.mode)) return false;
  const lastActivity = Math.max(session.lastActivityAt.getTime(), conversation.updatedAt.getTime());
  return now.getTime() - lastActivity > SESSION_INACTIVITY_MS;
}

export function isSessionAtLimit(session: Pick<ChatSessionRow, "agentMessages">): boolean {
  return session.agentMessages >= SESSION_MESSAGE_LIMIT;
}
