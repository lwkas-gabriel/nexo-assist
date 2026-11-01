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
  {
    messages = [],
    drafts = [],
    conversation,
  }: { messages?: ForgedMessage[]; drafts?: unknown[]; conversation?: unknown },
) {
  await page.route(CHAT_URL, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    const forged = { ...body, messages, drafts, ...(conversation ? { conversation } : {}) };
    await route.fulfill({ response, json: forged });
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

const OVERDUE_TICKET = {
  number: "INC-20311",
  title: "Notebook lento após atualização do Windows",
  category: "Hardware",
  priority: "Média",
  status: "Aguardando analista",
  statusCode: "waiting_analyst",
  isOpen: true,
  openedAt: "16/10, 14:20",
  openedOn: "16 out",
  lastTeamUpdateAt: "22/10, 14:20",
  timeWithoutTeamResponse: "5 dias",
  deadline: { rule: "3 dias úteis", dueAt: "27/10, 14:20", isOverdue: true },
  description: "Lentidão geral desde a atualização de 15/10.",
};
export const TICKET_MESSAGE: ForgedMessage = {
  id: "fixture-ticket",
  role: "assistant",
  metadata: { author: "agent" },
  parts: [
    {
      type: "tool-get_ticket",
      toolCallId: "fixture-ticket-call",
      state: "output-available",
      input: {},
      output: { ok: true, ticket: OVERDUE_TICKET },
    },
    { type: "text", text: "Esse chamado já passou do prazo." },
  ],
};

/** Registro de decisão (RF05) para a mensagem do agent ganhar o botão "detalhes da decisão". */
const DECISION = {
  intent: "consultar chamado",
  understood: "A pessoa quer saber do chamado INC-20311.",
  extracted: { ticketNumber: "INC-20311" },
  classifierConfidence: 0.9,
  finalConfidence: 0.75,
  isLowConfidence: false,
  reason: "Pergunta pelo andamento de um chamado.",
  confidenceSource: "classifier",
  steps: [{ tool: "get_ticket", ok: true, outcome: "concluiu", input: "chamado INC-20311" }],
  rules: ["RN07: chamado vencido → oferecer analista"],
  signals: [],
};
export const DECIDED_TICKET_MESSAGE: ForgedMessage = {
  ...TICKET_MESSAGE,
  metadata: { author: "agent", decision: DECISION } as ForgedMessage["metadata"],
};
