import { AppError } from "@nexo/shared/errors";

/**
 * Uma ação por vez em cada conversa (R06), entre o chat do funcionário e o console: um turno do
 * agent, uma nova sessão, um pedido de analista, assumir, responder, devolver ou encerrar. Sem
 * isso, o analista assumiria no meio de uma resposta do agent, que terminaria com a conversa já
 * com ele (RN08). Em memória: a api roda numa instância só, com o SQLite (ADR-0003).
 */
export function createConversationLocks() {
  const busy = new Set<string>();

  function acquire(conversationId: string, busyMessage: string): () => void {
    if (busy.has(conversationId)) throw new AppError("CONFLICT", busyMessage);
    busy.add(conversationId);
    return () => busy.delete(conversationId);
  }

  return {
    /** Trava a conversa e devolve quem a solta; para ações que terminam depois (streaming). */
    acquire,

    async run<T>(conversationId: string, busyMessage: string, action: () => Promise<T>) {
      const release = acquire(conversationId, busyMessage);
      try {
        return await action();
      } finally {
        release();
      }
    },
  };
}

export type ConversationLocks = ReturnType<typeof createConversationLocks>;
