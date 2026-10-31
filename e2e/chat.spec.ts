import { expect, test } from "@playwright/test";
import { loginAs } from "./support/login.ts";

/**
 * Cada teste que envia mensagem usa um funcionário só dele: as conversas ficam salvas no servidor
 * e o agent atende um turno por vez em cada conversa (R06), então testes em paralelo não podem
 * dividir a mesma conversa.
 */
test("o funcionário tira uma dúvida e vê o que o agent fez", async ({ page }, testInfo) => {
  await loginAs(
    page,
    testInfo.project.name === "mobile" ? "fabio.nunes@nexo.com.br" : "carla.mendes@nexo.com.br",
  );

  await page.getByLabel("Mensagem para o Nexo").fill("Qual o horário do service desk?");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText("Qual o horário do service desk?")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Ações do assistente" }).getByText("buscou na central de ajuda"),
  ).toBeVisible();
  await expect(page.getByText(/artigo "Horário do service desk"/)).toBeVisible();

  // RF05: o detalhe da decisão (coluna no desktop, folha no celular), e o foco volta ao fechar.
  const details = page.getByRole("button", { name: "detalhes da decisão" }).first();
  await details.click();
  const panel = page.getByRole(testInfo.project.name === "mobile" ? "dialog" : "complementary", {
    name: "Detalhe da decisão",
  });
  await expect(panel.getByText("buscou na central de ajuda")).toBeVisible();
  await expect(panel.getByRole("meter", { name: "Confiança" })).toBeVisible();
  await panel.getByRole("button", { name: "Fechar Detalhe da decisão" }).click();
  await expect(panel).toBeHidden();
  await expect(details).toBeFocused();

  // RF06, R38: pergunta com respostas rápidas; o clique vira a resposta do funcionário.
  await page.getByLabel("Mensagem para o Nexo").fill("O computador está lento");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByRole("button", { name: /Minha equipe/ }).click();
  await expect(page.getByRole("log").getByText("Minha equipe", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Minha equipe/ })).toBeDisabled();
});

test("RF11: a conversa continua depois de recarregar a página", async ({ page }, testInfo) => {
  await loginAs(
    page,
    testInfo.project.name === "mobile" ? "diego.ramos@nexo.com.br" : "elisa.prado@nexo.com.br",
  );
  await page.getByLabel("Mensagem para o Nexo").fill("Minha senha da rede expirou");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(/Senha da rede expirada/)).toBeVisible();

  await page.reload();

  await expect(page.getByText("Minha senha da rede expirou")).toBeVisible();
  await expect(page.getByText(/Senha da rede expirada/)).toBeVisible();
});

test("o botão de enviar fica desabilitado sem texto", async ({ page }) => {
  await loginAs(page, "ana.souza@nexo.com.br");

  await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
});
