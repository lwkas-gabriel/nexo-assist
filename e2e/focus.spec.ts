import { expect, test } from "@playwright/test";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Foco do teclado depois de uma ação (10.7). O navegador real joga o foco no <body> quando o botão
 * clicado fica desabilitado ou some, e o jsdom não reproduz isso: por isso a prova é aqui.
 * O envio é abortado na rede (`route.abort`), então ninguém grava mensagem na conta compartilhada.
 */
const MESSAGES_URL = /\/api\/chat\/messages$/;
const RETRY_LABEL = "Tentar novamente";

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
