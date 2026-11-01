import { expect, test, type Page } from "@playwright/test";
import { forgeConversation } from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Layout em navegador real (10.6): o jsdom não calcula larguras. As conversas são forjadas na
 * leitura (`page.route`), então nenhuma mensagem é enviada nem gravada nas contas compartilhadas.
 */
const PHONE_VIEWPORT = { width: 390, height: 844 };
/** Uma palavra só, sem hífen nem barra onde o navegador possa quebrar: um token, um hash, um erro. */
const UNBREAKABLE_TEXT = `https://nexo.com.br/diagnostico?sessao=${"a1B2c3D4e5F6g7H8i9J0".repeat(8)}`;
const CHAT_URL = /\/api\/chat$/;

/** Quanto sobra além da largura visível, em qualquer região de rolagem da tela (rolagem lateral). */
async function horizontalOverflowOf(page: Page): Promise<string[]> {
  return page.evaluate(`(() => {
    const overflowing = [];
    for (const element of document.querySelectorAll("body *")) {
      const isHidden = String(element.className).includes("sr-only");
      const style = getComputedStyle(element);
      // O truncate (reticências) corta de propósito; só a rolagem lateral é defeito.
      const isScrollable = style.overflowX !== "visible" && style.textOverflow !== "ellipsis";
      if (!isHidden && isScrollable && element.scrollWidth > element.clientWidth + 1) {
        overflowing.push(element.tagName + " " + element.scrollWidth + ">" + element.clientWidth);
      }
    }
    return overflowing;
  })()`);
}

function textMessage(id: string, role: "user" | "assistant", author: string, text: string) {
  return { id, role, metadata: { author }, parts: [{ type: "text", text }] };
}

test.describe("palavra longa numa bolha, no celular (10.6)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test.describe("funcionário", () => {
    test.use({ storageState: SHARED_SESSIONS.ana.file });

    test("as bolhas quebram a palavra, sem rolagem lateral", async ({ page }) => {
      await page.route(CHAT_URL, async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as Record<string, unknown>;
        const messages = [
          textMessage("fixture-1", "user", "employee", UNBREAKABLE_TEXT),
          textMessage("fixture-2", "assistant", "agent", UNBREAKABLE_TEXT),
          textMessage("fixture-3", "assistant", "analyst", UNBREAKABLE_TEXT),
        ];
        await route.fulfill({ response, json: { ...body, messages } });
      });
      await page.goto("/");
      await expect(page.getByRole("log", { name: "Conversa com o Nexo Assist" })).toBeVisible();

      expect(await horizontalOverflowOf(page)).toEqual([]);
    });
  });

  test.describe("analista", () => {
    test.use({ storageState: SHARED_SESSIONS.juliana.file });

    test("o console quebra a palavra do funcionário, sem rolagem lateral", async ({ page }) => {
      await forgeWaitingConversation(page, [UNBREAKABLE_TEXT]);
      await page.goto("/");
      await page.getByRole("button", { name: /Ana Souza/ }).click();
      await expect(page.getByRole("log", { name: "Conversa com Ana Souza" })).toBeVisible();

      expect(await horizontalOverflowOf(page)).toEqual([]);
    });
  });
});

test.describe("pílula do topo no celular (10.6)", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file, viewport: PHONE_VIEWPORT });

  const ANALYST_CONVERSATION = {
    id: "fixture-conversation",
    mode: "analyst",
    analyst: { name: "Rafael Lima", department: "Suporte N2" },
  };
  /** Uma linha de 12,5 px com o respiro da pílula; duas linhas passariam de 40 px. */
  const ONE_LINE_PILL_MAX_HEIGHT = 32;

  test("o nome do analista cabe numa linha, e o texto inteiro continua para o leitor de tela", async ({
    page,
  }) => {
    await forgeConversation(page, { conversation: ANALYST_CONVERSATION });
    await page.goto("/");
    const status = page.getByRole("status").filter({ hasText: "Com Rafael Lima" });

    await expect(status).toHaveText("Com Rafael Lima · Suporte N2");
    const box = await status.boundingBox();

    expect(box?.height ?? 0).toBeLessThanOrEqual(ONE_LINE_PILL_MAX_HEIGHT);
    expect(await horizontalOverflowOf(page)).toEqual([]);
  });
});
