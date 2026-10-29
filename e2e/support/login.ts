import { expect, type Page } from "@playwright/test";

export const ANA_EMAIL = "ana.souza@nexo.com.br";

/** Entra com uma conta de demonstração (qualquer senha funciona) e espera o chat aparecer. */
export async function loginAs(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha").fill("qualquer-senha");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
}
