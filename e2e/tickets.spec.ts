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
  const picker = page.getByRole("list", { name: "Seus chamados" });
  if (isMobile) {
    await expect(picker.getByRole("button", { name: /INC-20480/ })).toBeVisible();
  } else {
    // Os chamados abertos da tela 3 do protótipo; nenhum chamado de outra pessoa (RN09).
    await expect(picker.getByRole("button", { name: /INC-20311/ })).toBeVisible();
    await expect(picker.getByRole("button", { name: /INC-20298/ })).toBeVisible();
    await expect(page.getByText(/INC-20480/)).toHaveCount(0);
  }

  // RF08, RF09: escolher na lista mostra o card do chamado, sem o modelo (11.5).
  if (isMobile) {
    await picker.getByRole("button", { name: /INC-20480/ }).click();
    await expect(page.getByRole("region", { name: "Chamado INC-20480" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Não, obrigado" })).toHaveCount(0);
  } else {
    // RN07: o INC-20311 está vencido; a oferta de analista aparece, e o "Não, obrigado" é
    // respondido pelo código.
    await picker.getByRole("button", { name: /INC-20311/ }).click();
    const card = page.getByRole("region", { name: "Chamado INC-20311" });
    await expect(card.getByText("· prazo vencido")).toBeVisible();
    await page.getByRole("button", { name: "Não, obrigado" }).click();
    await expect(
      page.getByText(/^Combinado\. O INC-20311 continua com a equipe de TI/),
    ).toBeVisible();
  }
});
