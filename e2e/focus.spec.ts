import { expect, test, type Page } from "@playwright/test";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Foco do teclado depois de uma ação (10.7). O navegador real joga o foco no <body> quando o botão
 * clicado fica desabilitado ou some, e o jsdom não reproduz isso: por isso a prova é aqui.
 * O envio é abortado na rede (`route.abort`), então ninguém grava mensagem na conta compartilhada.
 */
const MESSAGES_URL = /\/api\/chat\/messages$/;
const RETRY_LABEL = "Tentar novamente";

const CHAT_URL = /\/api\/chat$/;
const SESSIONS_URL = /\/api\/chat\/sessions$/;
const SESSION_LIMIT = 30;
const SESSION_CREATED_AT = "2026-10-31T12:00:00.000Z";
/** Resposta do agent em streaming, já terminada: o envio dá certo sem tocar no servidor. */
const ANSWER_STREAM = [
  { type: "start" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Feito." },
  { type: "text-end", id: "t1" },
  { type: "finish" },
]
  .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
  .join("");

test.describe("funcionário", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  test("depois de enviar e de tentar novamente, o foco volta ao campo de mensagem", async ({
    page,
  }) => {
    await page.route(MESSAGES_URL, (route) => route.abort("internetdisconnected"));
    await page.goto("/");
    const field = page.getByLabel("Mensagem para o Nexo");
    await field.fill("Minha VPN caiu");

    await page.getByRole("button", { name: "Enviar" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(field).toBeFocused();

    // O alerta é refeito a cada falha, então o botão clicado sai da árvore.
    await page.getByRole("alert").getByRole("button", { name: RETRY_LABEL }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(field).toBeFocused();
  });
});

test.describe("funcionário no limite da sessão", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  /**
   * A conversa real da Ana com o contador forjado na leitura: faltando uma mensagem para o limite
   * (RN14) e, depois do envio simulado, no limite. Nada é gravado no servidor.
   */
  async function simulateSessionNearLimit(page: Page) {
    let isAtLimit = false;
    await page.route(CHAT_URL, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      const session = {
        agentMessages: isAtLimit ? SESSION_LIMIT : SESSION_LIMIT - 1,
        limit: SESSION_LIMIT,
        isAtLimit,
        startedAt: SESSION_CREATED_AT,
        previousSummary: null,
      };
      await route.fulfill({ response, json: { ...body, session } });
    });
    await page.route(MESSAGES_URL, (route) => {
      isAtLimit = true;
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        body: ANSWER_STREAM,
      });
    });
    await page.route(SESSIONS_URL, (route) => {
      isAtLimit = false;
      return route.fulfill({ status: 200, json: {} });
    });
  }

  test("a mensagem que esgota o limite leva o foco ao aviso, e Nova sessão o devolve ao campo", async ({
    page,
  }) => {
    await simulateSessionNearLimit(page);
    await page.goto("/");
    const field = page.getByLabel("Mensagem para o Nexo");
    await field.fill("Minha VPN caiu");
    await field.press("Enter");

    const notice = page.locator("p", { hasText: "Limite desta sessão atingido." });
    await expect(notice).toBeFocused();

    await page.getByRole("button", { name: "Nova sessão" }).click();

    await expect(field).toBeFocused();
  });
});
