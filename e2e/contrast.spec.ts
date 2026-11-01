import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DRAFT_PROPOSAL_MESSAGE,
  PENDING_DRAFT,
  forgeConversation,
} from "./support/chat-fixture.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Contraste (WCAG AA, 10.7) dos pares que a revisão da T26b achou abaixo do mínimo, conferido pelo
 * axe no navegador (ele mistura os fundos translúcidos). A varredura geral das telas é outro teste.
 */
async function colorContrastViolationsIn(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withRules(["color-contrast"])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(" ")}: ${node.any[0]?.message ?? ""}`),
  );
}

test.describe("funcionário", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  test("o atalho do botão Confirmar tem contraste suficiente", async ({ page }) => {
    await forgeConversation(page, {
      messages: [DRAFT_PROPOSAL_MESSAGE],
      drafts: [PENDING_DRAFT],
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Confirmar/ })).toBeVisible();

    expect(await colorContrastViolationsIn(page, "section[aria-label='Rascunho D-7']")).toEqual([]);
  });
});

test.describe("login", () => {
  // O painel de apresentação só aparece a partir de 1024 px (10.6).
  test.use({ viewport: { width: 1440, height: 900 } });

  test("o painel de apresentação tem contraste suficiente, inclusive a legenda do exemplo", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Sobre o Nexo Assist" })).toBeVisible();

    expect(
      await colorContrastViolationsIn(page, "section[aria-label='Sobre o Nexo Assist']"),
    ).toEqual([]);
  });
});
