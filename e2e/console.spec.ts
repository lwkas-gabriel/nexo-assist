import { expect, test } from "@playwright/test";
import { loginAs } from "./support/login.ts";

/**
 * Console do analista de ponta a ponta (RF18, RF19, RF21): a Isabela pede um analista e o
 * Rafael encontra a conversa em "Para você". A Isabela existe na demonstração só para este teste:
 * os outros funcionários conversam em testes que rodam em paralelo, e uma transferência os
 * quebraria. Roda no desktop; o console no celular tem teste de página (ConsolePage.test).
 */
test("analista encontra a conversa transferida e lê o porquê", async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "um funcionário só, sem concorrência entre projetos",
  );
  const { baseURL } = testInfo.project.use;

  const employeeContext = await browser.newContext({ baseURL });
  const employee = await employeeContext.newPage();
  await loginAs(employee, "isabela.martins@nexo.com.br");
  await employee.getByLabel("Mensagem para o Nexo").fill("Quero falar com um analista");
  await employee.getByRole("button", { name: "Enviar" }).click();
  await expect(employee.getByText("Aguardando analista", { exact: true })).toBeVisible();

  const analystContext = await browser.newContext({ baseURL });
  const analyst = await analystContext.newPage();
  await loginAs(analyst, "rafael.lima@nexo.com.br");
  await analyst.getByRole("radio", { name: /^Para você/ }).click();
  await analyst.getByRole("button", { name: /Isabela Martins/ }).click();

  await expect(analyst.getByRole("heading", { name: "Isabela Martins" })).toBeVisible();
  await expect(analyst.getByText("o funcionário pediu um analista", { exact: true })).toBeVisible();
  await expect(analyst.getByRole("complementary", { name: "Chamados de Isabela" })).toBeVisible();

  await employeeContext.close();
  await analystContext.close();
});
