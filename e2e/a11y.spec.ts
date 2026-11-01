import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DRAFT_PROPOSAL_MESSAGE,
  PENDING_DRAFT,
  forgeConversation,
  type ForgedMessage,
} from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Varredura geral do axe (10.7) nas telas e nos estados, no desktop e no celular (os dois projetos
 * do Playwright). Ninguém envia mensagem: as contas são compartilhadas com outros testes, em
 * paralelo, então as conversas são forjadas na leitura (`page.route`) e o resto é só navegação.
 * As regras de WCAG 2.x A e AA e as boas práticas do axe valem todas; nenhuma é desligada.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const CHAT_URL = /\/api\/chat$/;
const DRAWER_VIEWPORT = { width: 1100, height: 800 };
const NO_SESSION = { cookies: [], origins: [] };

/** Cada violação como texto: regra, impacto, o que o axe diz e o seletor, para o erro do teste ser legível. */
async function violationsOf(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} (${violation.impact}): ${node.target.join(" ")} | ${node.html}`,
    ),
  );
}

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
const TICKET_MESSAGE: ForgedMessage = {
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
const DECIDED_TICKET_MESSAGE: ForgedMessage = {
  ...TICKET_MESSAGE,
  metadata: { author: "agent", decision: DECISION } as ForgedMessage["metadata"],
};

test.describe("login", () => {
  test.use({ storageState: NO_SESSION });

  test("a tela de entrada não tem violações", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });
});

test.describe("funcionário", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  test("a conversa com o assistente não tem violações", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("o card do rascunho pendente não tem violações", async ({ page }) => {
    await forgeConversation(page, { messages: [DRAFT_PROPOSAL_MESSAGE], drafts: [PENDING_DRAFT] });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Confirmar/ })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("o card de um chamado vencido e a oferta de analista não têm violações", async ({
    page,
  }) => {
    await forgeConversation(page, { messages: [TICKET_MESSAGE] });
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Chamado INC-20311" })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("o detalhe da decisão aberto não tem violações", async ({ page }) => {
    await forgeConversation(page, { messages: [DECIDED_TICKET_MESSAGE] });
    await page.goto("/");
    await page.getByRole("button", { name: "detalhes da decisão" }).first().click();
    await expect(page.getByRole("button", { name: "Fechar Detalhe da decisão" })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("o perfil não tem violações", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Meu perfil" }).click();
    await expect(page.getByRole("heading", { name: "Meu perfil", level: 2 })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("o erro ao carregar a conversa não tem violações", async ({ page }) => {
    await page.route(CHAT_URL, (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    await expect(page.getByRole("alert")).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });
});

test.describe("analista", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  test("a lista do console não tem violações", async ({ page }) => {
    await forgeWaitingConversation(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Ana Souza/ })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("a conversa aberta no console não tem violações", async ({ page }) => {
    await forgeWaitingConversation(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Ana Souza/ }).click();
    await expect(page.getByRole("button", { name: "Assumir atendimento" })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("os chamados do funcionário, em gaveta ou tela cheia, não têm violações", async ({
    page,
  }, testInfo) => {
    // Em 1440 px o painel é fixo; a gaveta (10.6) aparece abaixo de 1280 px. O celular fica em 390 px.
    if (testInfo.project.name === "desktop") {
      await page.setViewportSize(DRAWER_VIEWPORT);
    }
    await forgeWaitingConversation(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Ana Souza/ }).click();
    await page.getByRole("button", { name: "Chamados de Ana Souza" }).click();
    await expect(page.getByRole("button", { name: "Fechar Chamados de Ana" })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });

  test("a lista vazia do console não tem violações", async ({ page }) => {
    await page.route(/\/api\/console\/conversations\?/, (route) =>
      route.fulfill({
        json: { counts: { all: 0, for_you: 0, with_agent: 0, mine: 0 }, conversations: [] },
      }),
    );
    await page.goto("/");
    await expect(page.getByRole("group", { name: "Filtro das conversas" })).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });
});
