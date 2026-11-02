import { expect, test } from "@playwright/test";
import { ANA_EMAIL, loginAs } from "./support/login.ts";

/** RF24, A01: "Meu perfil" só de leitura, pela navegação (lateral no desktop, topo no celular). */
test("o funcionário abre o perfil e volta ao atendimento", async ({ page }) => {
  await loginAs(page, ANA_EMAIL);

  await page.getByRole("link", { name: "Meu perfil" }).click();

  await expect(page.getByRole("heading", { name: "Meu perfil", level: 2 })).toBeVisible();
  // Só os dados do perfil: no desktop o mesmo e-mail também aparece no rodapé da lateral.
  await expect(page.locator("dl").getByText(ANA_EMAIL, { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem para o Nexo" })).toBeHidden();
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByText(/qualquer senha entra/)).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();
});
