import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./support/login.ts";

/**
 * Abrir chamado de ponta a ponta (RF15, RN04): o agent monta o rascunho e só a confirmação do
 * funcionário (por texto, pelo botão do card ou por Ctrl/⌘+Enter) cria o chamado no
 * tickets-service. Cada projeto usa um funcionário próprio, para os testes em paralelo não
 * dividirem a conversa.
 */
test("RF15: abre um chamado conversando, conferindo o rascunho antes", async ({
  page,
}, testInfo) => {
  const email =
    testInfo.project.name === "mobile"
      ? "henrique.alves@nexo.com.br"
      : "gabriela.rocha@nexo.com.br";
  await loginAs(page, email);
  const composer = page.getByLabel("Mensagem para o Nexo");
  const send = page.getByRole("button", { name: "Enviar" });

  await composer.fill("Quero abrir um chamado: o notebook não liga desde hoje cedo");
  await send.click();
  await expect(page.getByText(/Montei o rascunho D-\d+/)).toBeVisible();
  await expect(page.getByText("montou o rascunho")).toBeVisible();

  await composer.fill("Confirmo, pode criar");
  await send.click();
  await expect(page.getByText(/chamado INC-\d{5} criado/)).toBeVisible();
  await expect(page.getByText("confirmou o rascunho", { exact: true })).toBeVisible();

  // RN04 pelo botão do card (11.5): sem passar pelo modelo.
  const byButton = await proposeDraft(
    page,
    "Preciso abrir um chamado: o monitor externo não dá imagem",
  );
  await byButton.getByRole("button", { name: /^Confirmar/ }).click();
  await expect(byButton.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();

  // R33: Ctrl/⌘+Enter no campo de mensagem confirma o rascunho pendente.
  const byShortcut = await proposeDraft(
    page,
    "Quero abrir um chamado: o teclado do notebook falha em algumas teclas",
  );
  await composer.press("ControlOrMeta+Enter");
  await expect(byShortcut.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();
  await expect(page.getByText(/^Criado · INC-\d{5}$/)).toHaveCount(3);
});

/**
 * Pede um chamado e devolve o card novo, já pronto para confirmar (o agent terminou de responder).
 * Conta os cards antes, para não pegar o anterior enquanto o novo ainda chega.
 */
async function proposeDraft(page: Page, text: string): Promise<Locator> {
  const cards = page.getByRole("region", { name: /^Rascunho D-\d+$/ });
  const before = await cards.count();
  await page.getByLabel("Mensagem para o Nexo").fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(cards).toHaveCount(before + 1);
  const card = cards.last();
  await expect(card.getByRole("button", { name: /^Confirmar/ })).toBeEnabled();
  return card;
}
