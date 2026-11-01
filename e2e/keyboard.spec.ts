import { expect, test, type Page } from "@playwright/test";
import {
  DRAFT_PROPOSAL_MESSAGE,
  PENDING_DRAFT,
  forgeConversation,
} from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Teclado (10.7): a ordem do Tab segue a ordem de leitura, todo elemento que recebe o foco mostra
 * onde ele está, e depois de enviar o foco volta ao campo. As conversas são forjadas na leitura e
 * o envio é respondido na rede (`page.route`): ninguém grava nada nas contas compartilhadas.
 */
const MESSAGES_URL = /\/api\/chat\/messages$/;
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

type FocusIndicator = "outline" | "box-shadow" | "field-wrapper" | "none";

/**
 * Como o elemento focado se destaca. Os campos de texto escondem o contorno e trocam a borda ou o
 * anel do conjunto (campo + ícone ou botão); o resto usa o contorno global de `:focus-visible`.
 */
async function focusIndicatorOfActiveElement(page: Page): Promise<FocusIndicator> {
  return page.evaluate(`(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) return "outline";
    if (style.boxShadow !== "none") return "box-shadow";
    const wrapper = element.parentElement;
    const look = () => getComputedStyle(wrapper).borderColor + getComputedStyle(wrapper).boxShadow;
    const focusedLook = look();
    element.blur();
    const idleLook = look();
    element.focus();
    return focusedLook !== idleLook ? "field-wrapper" : "none";
  })()`);
}

/**
 * Aperta Tab (ou Shift+Tab) uma vez por nome esperado e confere o nome e o destaque do foco.
 * Começa do canto da tela: o foco inicial do navegador depende de onde a página parou.
 */
async function expectTabOrder(page: Page, names: (string | RegExp)[], key = "Tab") {
  for (const name of names) {
    await page.keyboard.press(key);
    await expect(page.locator(":focus")).toHaveAccessibleName(name);
    expect(await focusIndicatorOfActiveElement(page)).not.toBe("none");
  }
}

async function startFromTopOfPage(page: Page) {
  await page.mouse.click(1, 1);
}

test.describe("funcionário", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  test("o Tab segue a ordem de leitura, do menu ao card do rascunho e ao campo, com o foco visível", async ({
    page,
  }, testInfo) => {
    await forgeConversation(page, { messages: [DRAFT_PROPOSAL_MESSAGE], drafts: [PENDING_DRAFT] });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Confirmar/ })).toBeVisible();
    await startFromTopOfPage(page);
    // No celular o menu lateral vira ícones no topo, sem o link "Atendimento".
    const menu =
      testInfo.project.name === "mobile"
        ? ["Meu perfil", "Sair"]
        : ["Atendimento", "Meu perfil", "Sair"];
    const rest = [/^Confirmar/, "Editar", "Cancelar", "Mensagem para o Nexo"];

    await expectTabOrder(page, [...menu, ...rest]);
  });

  test("o Shift+Tab percorre a mesma ordem ao contrário", async ({ page }) => {
    await forgeConversation(page, { messages: [DRAFT_PROPOSAL_MESSAGE], drafts: [PENDING_DRAFT] });
    await page.goto("/");
    await page.getByLabel("Mensagem para o Nexo").click();

    await expectTabOrder(page, ["Cancelar", "Editar", /^Confirmar/], "Shift+Tab");
  });

  test("depois de enviar com Enter, o foco continua no campo", async ({ page }) => {
    await page.route(MESSAGES_URL, (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        body: ANSWER_STREAM,
      }),
    );
    await page.goto("/");
    const field = page.getByLabel("Mensagem para o Nexo");
    await field.click();

    await field.fill("Qual o horário do service desk?");
    await page.keyboard.press("Enter");

    await expect(page.getByText("Feito.")).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("");
  });

  test("depois de enviar pelo botão com o teclado, o foco volta ao campo", async ({ page }) => {
    await page.route(MESSAGES_URL, (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        body: ANSWER_STREAM,
      }),
    );
    await page.goto("/");
    const field = page.getByLabel("Mensagem para o Nexo");
    await field.fill("Qual o horário do service desk?");

    // O botão sai da ordem do Tab enquanto o campo está vazio e entra quando há texto.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Feito.")).toBeVisible();
    await expect(field).toBeFocused();
  });
});

test.describe("analista", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  test("o Tab percorre filtros, lista, conversa e chamados, com o foco visível", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "no celular a conversa e a lista são telas separadas",
    );
    await forgeWaitingConversation(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Ana Souza/ }).click();
    await expect(page.getByRole("button", { name: "Assumir atendimento" })).toBeVisible();
    await startFromTopOfPage(page);

    await expectTabOrder(page, [
      "Sair",
      "Disponível",
      "Pesquisar conversa ou chamado",
      /^Todas/,
      /^Para você/,
      /^Com o agent/,
      /^Minhas/,
      /Ana Souza/,
      "Devolver ao agent",
      "Assumir atendimento",
      "Fechar Chamados de Ana",
    ]);
  });
});
