import { expect, test, type TestInfo } from "@playwright/test";
import { proposeDraft } from "./support/drafts.ts";
import { loginAs } from "./support/login.ts";

function employeeEmailOf(testInfo: TestInfo): string {
  return testInfo.project.name === "mobile"
    ? "henrique.alves@nexo.com.br"
    : "gabriela.rocha@nexo.com.br";
}

/**
 * Abrir chamado de ponta a ponta (RF15, RN04): o agent monta o rascunho e só a confirmação do
 * funcionário (por texto, pelo botão do card ou por Ctrl/⌘+Enter) cria o chamado no
 * tickets-service. Cada projeto usa um funcionário próprio, para os testes em paralelo não
 * dividirem a conversa.
 */
test("RF15: abre um chamado conversando, conferindo o rascunho antes", async ({
  page,
}, testInfo) => {
  await loginAs(page, employeeEmailOf(testInfo));
  const composer = page.getByLabel("Mensagem para o Nexo");
  const send = page.getByRole("button", { name: "Enviar" });

  // A conversa fica salva e os testes deste arquivo dividem o funcionário: cada passo espera o
  // card novo (e não "o único"), para não confundir com o de um teste anterior.
  const byText = await proposeDraft(
    page,
    "Quero abrir um chamado: o notebook não liga desde hoje cedo",
  );
  await expect(page.getByText(/Montei o rascunho D-\d+/).last()).toBeVisible();
  await expect(page.getByText("montou o rascunho").last()).toBeVisible();

  await composer.fill("Confirmo, pode criar");
  await send.click();
  await expect(byText.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();
  await expect(page.getByText(/chamado INC-\d{5} criado/).last()).toBeVisible();
  await expect(page.getByText("confirmou o rascunho", { exact: true }).last()).toBeVisible();

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
});
