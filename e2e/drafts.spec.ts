import { expect, test } from "@playwright/test";
import { loginAs } from "./support/login.ts";

/**
 * Abrir chamado de ponta a ponta (RF15, RN04): o agent monta o rascunho e só a confirmação do
 * funcionário, numa mensagem seguinte, cria o chamado no tickets-service.
 * Cada projeto usa um funcionário próprio, para os testes em paralelo não dividirem a conversa.
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
});
