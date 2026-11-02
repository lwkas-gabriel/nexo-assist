import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  DRAFT_PROPOSAL_MESSAGE,
  PENDING_DRAFT,
  forgeConversation,
} from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { contrastRatio, parseRgba } from "./support/contrast.ts";
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

/** WCAG 1.4.11: o que marca o item selecionado é um componente de interface, mínimo de 3:1. */
const NON_TEXT_CONTRAST_MIN = 3;
const RING_SHADOW_PATTERN = /(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+2px/;

test.describe("analista", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  test("o contorno do item selecionado da lista tem contraste de componente (3:1)", async ({
    page,
  }, testInfo) => {
    // No celular, a lista dá lugar à conversa: não há item selecionado à vista.
    test.skip(testInfo.project.name === "mobile", "a lista some quando a conversa abre");
    await forgeWaitingConversation(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Ana Souza/ }).click();
    const selected = page.locator("[data-conversation-id][aria-current='true']");
    await expect(selected).toBeVisible();

    const boxShadow = await page.evaluate(
      `getComputedStyle(document.querySelector("[data-conversation-id][aria-current=true]")).boxShadow`,
    );
    const ring = RING_SHADOW_PATTERN.exec(String(boxShadow));

    expect(ring, `contorno de 2 px não encontrado em: ${String(boxShadow)}`).not.toBeNull();
    expect(contrastRatio(parseRgba(ring?.[1] ?? ""))).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_MIN);
  });
});
