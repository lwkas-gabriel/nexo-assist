import type { Page } from "@playwright/test";

/**
 * Uma conversa aguardando analista forjada na leitura do console, para provar o que o navegador
 * faz com o foco e com o layout sem transferir ninguém de verdade (as contas são compartilhadas
 * com outros testes, que rodam em paralelo). Nada é gravado no servidor.
 */
const FIXTURE_CONVERSATION_ID = "fixture-ana";
const FIXTURE_DUE_AT = "2099-10-31T15:05:00Z";
const FIXTURE_UPDATED_AT = "2026-10-31T13:05:00Z";

const EMPLOYEE = { name: "Ana Souza", department: "Financeiro", isOnline: true };
const WAITING_STATE = {
  kind: "waiting",
  reason: "chamado com prazo vencido",
  ticketNumber: "INC-20311",
  responseDueAt: FIXTURE_DUE_AT,
  confidence: null,
};
const LIST = {
  counts: { all: 1, for_you: 1, with_agent: 0, mine: 0 },
  conversations: [
    {
      id: FIXTURE_CONVERSATION_ID,
      employee: EMPLOYEE,
      state: WAITING_STATE,
      updatedAt: FIXTURE_UPDATED_AT,
      lastMessage: {
        author: "employee",
        text: "Quero falar com um analista.",
        createdAt: FIXTURE_UPDATED_AT,
        seenByEmployee: null,
      },
      unread: 1,
    },
  ],
};
const CONVERSATION = {
  conversation: {
    id: FIXTURE_CONVERSATION_ID,
    mode: "waiting_analyst",
    version: 2,
    employee: EMPLOYEE,
    state: WAITING_STATE,
    handoff: {
      reason: "chamado com prazo vencido",
      supportLevel: "N2",
      problem: "Notebook lento há 6 dias, sem resposta da TI.",
      attempted: "Reiniciou e rodou o diagnóstico.",
      ticketNumber: "INC-20311",
      responseDueAt: FIXTURE_DUE_AT,
    },
  },
  messages: [
    {
      id: "fixture-m1",
      role: "user",
      metadata: { author: "employee" },
      parts: [{ type: "text", text: "Quero falar com um analista." }],
    },
  ],
  drafts: [],
};
const TICKETS = {
  employeeName: "Ana Souza",
  openCount: 0,
  closedCount: 0,
  thisConversation: [],
  others: [],
};

/** Lista, conversa e chamados do console mostram só a conversa forjada, aguardando analista. */
export async function forgeWaitingConversation(page: Page) {
  await page.route(/\/api\/console\/conversations\?/, (route) => route.fulfill({ json: LIST }));
  await page.route(/\/api\/console\/conversations\/[^/]+\/tickets$/, (route) =>
    route.fulfill({ json: TICKETS }),
  );
  await page.route(/\/api\/console\/conversations\/[^/?]+$/, (route) =>
    route.fulfill({ json: CONVERSATION }),
  );
}
