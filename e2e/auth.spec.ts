import { expect, test } from "@playwright/test";
import { ANA_EMAIL, loginAs } from "./support/login.ts";

test("e-mail desconhecido mostra a mensagem de erro, sem entrar", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("E-mail corporativo").fill("nao.existe@nexo.com.br");
  await page.getByLabel("Senha").fill("qualquer-senha");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
});

test("sair volta para a tela de login", async ({ page }) => {
  await loginAs(page, ANA_EMAIL);

  await page.getByRole("button", { name: "Sair" }).click();

  await expect(page.getByLabel("E-mail corporativo")).toBeVisible();
});
