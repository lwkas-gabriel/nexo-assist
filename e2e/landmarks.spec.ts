import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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
});
