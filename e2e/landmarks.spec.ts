import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DRAFT_PROPOSAL_MESSAGE,
  PENDING_DRAFT,
  forgeConversation,
} from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Estrutura da página (landmarks, títulos e nomes acessíveis) conferida pelo axe, uma regra por
 * achado da revisão da T26b. A varredura geral das telas é outro teste. As conversas são forjadas
 * na leitura (`page.route`): nada é enviado nem gravado nas contas compartilhadas.
 */
const PHONE_VIEWPORT = { width: 390, height: 844 };

async function violationsOf(page: Page, rule: string) {
  const results = await new AxeBuilder({ page }).withRules([rule]).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => node.target.join(" ")),
  );
}

test.describe("analista", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  test("no celular, a lista de conversas está dentro de um landmark main", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await forgeWaitingConversation(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Ana Souza/ })).toBeVisible();

    expect(await violationsOf(page, "landmark-one-main")).toEqual([]);
  });

  test("no celular, com a conversa aberta, a página tem um título de nível 1", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await forgeWaitingConversation(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Ana Souza/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ana Souza" })).toBeVisible();

    expect(await violationsOf(page, "page-has-heading-one")).toEqual([]);
  });

  test("os filtros da lista têm nome acessível que contém o texto visível", async ({ page }) => {
    await forgeWaitingConversation(page);
    await page.goto("/");
    await expect(page.getByRole("group", { name: "Filtro das conversas" })).toBeVisible();

    expect(await violationsOf(page, "label-content-name-mismatch")).toEqual([]);
  });
});

test.describe("funcionário", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  test("o card do rascunho não pula nível de título", async ({ page }) => {
    await forgeConversation(page, { messages: [DRAFT_PROPOSAL_MESSAGE], drafts: [PENDING_DRAFT] });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Confirmar/ })).toBeVisible();

    expect(await violationsOf(page, "heading-order")).toEqual([]);
  });
});
