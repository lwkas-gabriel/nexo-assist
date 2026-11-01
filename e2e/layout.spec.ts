import { expect, test } from "@playwright/test";
import { forgeConversation } from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { horizontalOverflowOf } from "./support/overflow.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Layout em navegador real (10.6): o jsdom não calcula larguras. As conversas são forjadas na
 * leitura (`page.route`), então nenhuma mensagem é enviada nem gravada nas contas compartilhadas.
 */
const PHONE_VIEWPORT = { width: 390, height: 844 };
/** Uma palavra só, sem hífen nem barra onde o navegador possa quebrar: um token, um hash, um erro. */
const UNBREAKABLE_TEXT = `https://nexo.com.br/diagnostico?sessao=${"a1B2c3D4e5F6g7H8i9J0".repeat(8)}`;
const CHAT_URL = /\/api\/chat$/;

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

test.describe("topo da conversa do console, no celular e no tablet (10.6)", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  for (const width of [390, 768, 800]) {
    test(`com ${width} px, o nome do funcionário aparece inteiro`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await forgeWaitingConversation(page);
      await page.goto("/");
      await page.getByRole("button", { name: /Ana Souza/ }).click();
      const title = page.getByRole("heading", { level: 2, name: "Ana Souza" });
      await expect(title).toBeVisible();

      // `truncate` corta com reticências quando o texto não cabe: aí o texto passa da caixa.
      const isTruncated = await page.evaluate(
        `(() => { const el = document.getElementById("console-conversation-title"); return el.scrollWidth > el.clientWidth; })()`,
      );
      expect(isTruncated).toBe(false);
      expect(await horizontalOverflowOf(page)).toEqual([]);
    });
  }
});

test.describe("barra de atendimento do console, no celular e no tablet (10.6)", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  for (const width of [390, 768, 800]) {
    test(`com ${width} px, "Devolver ao agent" e "Assumir atendimento" ficam numa linha cada`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await forgeWaitingConversation(page);
      await page.goto("/");
      await page.getByRole("button", { name: /Ana Souza/ }).click();
      await expect(page.getByRole("button", { name: "Assumir atendimento" })).toBeVisible();

      // O botão tem altura fixa: com o rótulo em duas linhas, o texto passa da caixa.
      const wrappedLabels = await page.evaluate(`(() => {
        const wrapped = [];
        for (const button of document.querySelectorAll("button")) {
          const text = (button.textContent || "").trim();
          if (["Devolver ao agent", "Assumir atendimento"].includes(text) && button.scrollHeight > button.clientHeight) wrapped.push(text);
        }
        return wrapped;
      })()`);

      expect(wrappedLabels).toEqual([]);
      expect(await horizontalOverflowOf(page)).toEqual([]);
    });
  }
});
