import type { Page } from "@playwright/test";

/**
 * A conversa real da pessoa logada, com as mensagens e os rascunhos trocados na leitura
 * (`GET /api/chat`), para pôr na tela um estado que o servidor de teste não produz sem gravar nada.
 * Nada é enviado nem gravado: as contas são compartilhadas com outros testes, em paralelo.
 */
const CHAT_URL = /\/api\/chat$/;

export type ForgedMessage = {
  id: string;
  role: "user" | "assistant";
  metadata: { author: string };
  parts: unknown[];
};

export async function forgeConversation(
  page: Page,
  { messages, drafts = [] }: { messages: ForgedMessage[]; drafts?: unknown[] },
) {
  await page.route(CHAT_URL, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, messages, drafts } });
  });
}

/** Rascunho de chamado novo, pendente, com o card completo (prioridade, prazo e campos). */
export const PENDING_DRAFT = {
  draftId: "D-7",
  number: 7,
  kind: "create",
  status: "pending",
  ticketNumber: null,
  ticket: {
    title: "VPN não conecta no notebook",
    description: "Desde ontem o notebook não conecta na VPN.",
    type: "Incidente",
    category: "Rede e VPN",
    affected: "Somente você",
    priority: "Alta",
    priorityReason: null,
    slaRule: "4 horas úteis",
    firstResponseBy: "27/10, 13:43",
  },
  fields: {
    title: "VPN não conecta no notebook",
    description: "Desde ontem o notebook não conecta na VPN.",
    type: "incident",
    category: "network_vpn",
    affected: "just_me",
    urgency: "deadline_today",
  },
};

/** A mensagem do agent que propôs o rascunho. */
export const DRAFT_PROPOSAL_MESSAGE: ForgedMessage = {
  id: "fixture-proposal",
  role: "assistant",
  metadata: { author: "agent" },
  parts: [
    {
      type: "tool-propose_ticket_draft",
      toolCallId: "fixture-proposal-call",
      state: "output-available",
      input: {},
      output: { ok: true, draft: PENDING_DRAFT },
    },
    { type: "text", text: "Montei o rascunho. Confira antes de confirmar." },
  ],
};
