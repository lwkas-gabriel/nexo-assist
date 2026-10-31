import { expect, test } from "@playwright/test";
import { loginAs } from "./support/login.ts";

/**
 * Console do analista de ponta a ponta (RF18, RF19, RF21): a Isabela pede um analista e o
 * Rafael encontra a conversa em "Para você". A Isabela existe na demonstração só para este teste:
 * os outros funcionários conversam em testes que rodam em paralelo, e uma transferência os
 * quebraria. Roda no desktop; o console no celular tem teste de página (ConsolePage.test).
 */
test("analista encontra a conversa transferida, assume, responde, devolve e encerra", async ({
  browser,
}, testInfo) => {
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
  await analyst.getByRole("button", { name: /^Para você/ }).click();
  await analyst.getByRole("button", { name: /Isabela Martins/ }).click();

  await expect(analyst.getByRole("heading", { name: "Isabela Martins" })).toBeVisible();
  await expect(analyst.getByText("o funcionário pediu um analista", { exact: true })).toBeVisible();
  await expect(analyst.getByRole("complementary", { name: "Chamados de Isabela" })).toBeVisible();

  // RF20, tela 5: assumir, responder e devolver; o funcionário vê tudo pelo polling (RF17, R27).
  await analyst.getByRole("button", { name: "Assumir atendimento" }).click();
  await expect(employee.getByText("Com Rafael Lima · Suporte N2")).toBeVisible();
  await analyst.getByLabel("Resposta para Isabela").fill("Oi, Isabela. Já estou com o seu caso.");
  await analyst.getByRole("button", { name: "Enviar" }).click();
  await expect(employee.getByText("Oi, Isabela. Já estou com o seu caso.")).toBeVisible();
  await analyst.getByRole("button", { name: "Devolver ao agent" }).click();
  await expect(employee.getByText("Assistente online")).toBeVisible();
  await expect(employee.getByText("Rafael Lima devolveu a conversa ao assistente.")).toBeVisible();

  // A08, ADR-0007: encerrar o atendimento volta ao assistente com sessão nova e resumo.
  await employee.getByLabel("Mensagem para o Nexo").fill("Quero falar com um analista de novo");
  await employee.getByRole("button", { name: "Enviar" }).click();
  await analyst.getByRole("button", { name: "Assumir atendimento" }).click();
  await analyst.getByRole("button", { name: "Encerrar atendimento" }).click();
  await expect(
    employee.getByText("Atendimento encerrado por Rafael Lima.", { exact: true }),
  ).toBeVisible();
  await expect(employee.getByText("Resumo da sessão anterior")).toBeVisible();

  await employeeContext.close();
  await analystContext.close();
});
