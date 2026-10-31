import { expect, test } from "@playwright/test";
import { ANA_EMAIL, loginAs } from "./support/login.ts";

/** RF24, A01: "Meu perfil" só de leitura, pela navegação (lateral no desktop, topo no celular). */
test("o funcionário abre o perfil e volta ao atendimento", async ({ page }) => {
  await loginAs(page, ANA_EMAIL);

  await page.getByRole("link", { name: "Meu perfil" }).click();

  await expect(page.getByRole("heading", { name: "Meu perfil", level: 2 })).toBeVisible();
  await expect(
    page.getByText(ANA_EMAIL, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByText(/qualquer senha entra/)).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();
});
