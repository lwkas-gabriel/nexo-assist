import type { Database } from "./database.ts";
import {
  authSessions,
  chatSessions,
  conversations,
  decisionTraces,
  drafts,
  handoffs,
  messages,
} from "./schema.ts";

/**
 * Volta a api ao estado inicial de demonstração: sem conversas, sessões, registros de decisão, rascunhos, transferências,
 * mensagens nem sessões.
 * Os chamados vivem no tickets-service, que tem o seu próprio seed.
 */
export async function resetDemoData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(decisionTraces);
    await tx.delete(chatSessions);
    await tx.delete(drafts);
    await tx.delete(handoffs);
    await tx.delete(messages);
    await tx.delete(conversations);
    await tx.delete(authSessions);
  });
}
