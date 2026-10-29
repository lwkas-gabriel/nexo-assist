import { expect, test } from "@playwright/test";

test("o funcionário tira uma dúvida e vê o que o agent fez", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Mensagem para o Nexo").fill("Qual o horário do service desk?");
  await page.getByRole("button", { name: "Enviar" }).click();

  // A mensagem do funcionário aparece, seguida da ação do agent e da resposta (modelo de teste).
  await expect(page.getByText("Qual o horário do service desk?")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Ações do assistente" }).getByText("buscou na central de ajuda"),
  ).toBeVisible();
  await expect(page.getByText(/artigo "Horário do service desk"/)).toBeVisible();
});

test("o botão de enviar fica desabilitado sem texto", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
});
