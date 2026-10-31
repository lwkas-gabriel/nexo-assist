/**
 * Estados da conversa (11.3), declarados uma vez só para a api e para a tela: um estado novo
 * quebra a compilação dos dois lados, em vez de passar despercebido no front.
 */
export const CONVERSATION_MODES = ["agent", "waiting_analyst", "analyst", "closed"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];
