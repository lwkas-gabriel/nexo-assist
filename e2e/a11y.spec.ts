import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DECIDED_TICKET_MESSAGE,
  DRAFT_PROPOSAL_MESSAGE,
  TICKET_MESSAGE,
  PENDING_DRAFT,
  forgeConversation,
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

/**
 * O que o axe não consegue decidir (`incomplete`) e a conta de contraste manual cobre: texto de
 * leitura (`ink`, `ink-2`, `ink-3`) sobre `paper` com um fundo escuro translúcido de gaveta ou folha
 * passando por perto, o que o axe chama de "sobreposição parcial". Esses pares estão em
 * `apps/web/src/ui/contrast.test.ts`. Qualquer outra regra, ou outro texto, volta como falha.
 */
const MANUALLY_CHECKED_TEXT = /\btext-ink(-[23])?\b/;

/**
 * Cada problema como texto, para o erro do teste ser legível: as violações (regra, impacto,
 * seletor) e os `incomplete` que a conferência manual acima não explica.
 */
async function violationsOf(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const violations = results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} (${violation.impact}): ${node.target.join(" ")} | ${node.html}`,
    ),
  );
  const unexplained = results.incomplete.flatMap((item) =>
    item.nodes
      .filter((node) => item.id !== "color-contrast" || !MANUALLY_CHECKED_TEXT.test(node.html))
      .map((node) => `${item.id} (o axe não decidiu): ${node.target.join(" ")} | ${node.html}`),
  );
  return [...violations, ...unexplained];
}

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
    // Conversa forjada e vazia: a real da Ana é a que o tickets.spec usa em paralelo.
    await forgeConversation(page, {});
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
    // O texto só aparece depois do esqueleto de carregamento, que não é o estado vazio.
    await expect(page.getByText("Nenhuma conversa ainda.")).toBeVisible();

    expect(await violationsOf(page)).toEqual([]);
  });
});
