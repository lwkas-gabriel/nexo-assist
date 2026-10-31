import { expect, test } from "@playwright/test";
import { loginAs } from "./support/login.ts";

/**
 * Consulta de chamados de ponta a ponta: chat → agent → api → tickets-service (dados de demonstração).
 * Desktop usa a Ana (chamados das telas do protótipo); celular usa o Bruno, para os testes em
 * paralelo não dividirem a mesma conversa.
 */
test("RF13: o funcionário pergunta pelos chamados sem saber o número", async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  await loginAs(page, isMobile ? "bruno.tavares@nexo.com.br" : "ana.souza@nexo.com.br");

  await page.getByLabel("Mensagem para o Nexo").fill("Qual o status do meu chamado?");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(
    page.getByRole("list", { name: "Ações do assistente" }).getByText("consultou seus chamados"),
  ).toBeVisible();
  if (isMobile) {
    await expect(page.getByText(/INC-20480/)).toBeVisible();
  } else {
    // Os 3 chamados abertos da tela 3 do protótipo; nenhum chamado de outra pessoa.
    await expect(page.getByText(/INC-20311.*INC-20298|INC-20298.*INC-20311/)).toBeVisible();
    await expect(page.getByText(/INC-20480/)).toHaveCount(0);
  }
});
