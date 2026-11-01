import { randomUUID } from "node:crypto";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { expectCriticalDeadline } from "./support/deadline.ts";
import {
  askAgent,
  cardField,
  editDraft,
  proposeDraft,
  TICKET_LIST_ANSWER,
} from "./support/drafts.ts";
import { loginAs } from "./support/login.ts";

const CONSOLE_FLOW_TIMEOUT_MS = 90_000;
/** Mensagens que chegam ao outro lado pelo polling (3 s no console, menos no chat): com folga. */
const POLLING_TIMEOUT_MS = 15_000;

/**
 * Console do analista de ponta a ponta (RF18, RF19, RF21): a Isabela pede um analista e o
 * Rafael encontra a conversa em "Para você". A Isabela existe na demonstração só para este teste:
 * os outros funcionários conversam em testes que rodam em paralelo, e uma transferência os
 * quebraria. Roda no desktop; o console no celular tem teste de página (ConsolePage.test) e o E2E
 * do chamado crítico, mais abaixo, que roda também em 390 × 844.
 */
test("analista encontra a conversa transferida, assume, responde, devolve e encerra", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "um funcionário só, sem concorrência entre projetos",
  );
  // Dois navegadores e várias esperas de polling: sozinho leva ~13 s, mas com a suíte em paralelo
  // chegou a 29 s, perto do limite padrão de 30 s. Só o tempo muda, o fluxo é o mesmo.
  test.setTimeout(CONSOLE_FLOW_TIMEOUT_MS);
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
  // A conversa fica salva e o outro teste deste arquivo também devolve: conta as linhas antes.
  const returnedLines = employee.getByText("Rafael Lima devolveu a conversa ao assistente.");
  const returnedBefore = await returnedLines.count();
  await analyst.getByRole("button", { name: "Devolver ao agent" }).click();
  await expect(employee.getByText("Assistente online")).toBeVisible();
  await expect(returnedLines).toHaveCount(returnedBefore + 1);

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

const DESKTOP_VIEW = {
  name: "desktop",
  isPhone: false,
  context: { viewport: { width: 1440, height: 900 } },
};
const PHONE_VIEW = {
  name: "celular 390 × 844",
  isPhone: true,
  context: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
};
type View = typeof DESKTOP_VIEW | typeof PHONE_VIEW;

async function openSession(
  browser: Browser,
  baseURL: string | undefined,
  view: View,
  email: string,
) {
  const context = await browser.newContext({ baseURL, ...view.context });
  const page = await context.newPage();
  await loginAs(page, email);
  return { context, page };
}

/**
 * O chamado da transferência no painel do analista (RF21): no desktop, a coluna ao lado da
 * conversa; no celular, a folha que abre pelo botão "Chamados de ...", que se fecha em seguida.
 */
async function expectLinkedTicket(
  analyst: Page,
  view: View,
  ticket: { number: string; status: string },
) {
  const check = async (panel: ReturnType<Page["locator"]>) => {
    const card = panel.locator("article", { hasText: ticket.number });
    await expect(card).toContainText(ticket.status);
    await expect(card).toContainText("prioridade crítica");
    await expect(card).toContainText("Prazo (1 hora)");
  };
  if (!view.isPhone) {
    await check(analyst.getByRole("complementary", { name: "Chamados de Isabela" }));
    return;
  }
  await analyst.getByRole("button", { name: /^Chamados de Isabela/ }).click();
  const sheet = analyst.getByRole("dialog");
  await check(sheet);
  await sheet.getByRole("button", { name: /Fechar/ }).click();
  await expect(sheet).toBeHidden();
}

/**
 * Chamado crítico de ponta a ponta, visto pelos dois lados (A04, R31, R18, RN08, RN09, RN14): a
 * Isabela abre o chamado, o código transfere a conversa sozinho, o Rafael assume, as mensagens vão
 * e voltam sem o agent, o contador fica pausado e, ao devolver, o chamado vai de "em atendimento"
 * para "em andamento" e o agent volta a responder, só com os chamados dela. O teste de cima usa um
 * pedido de analista, que não tem chamado ligado; este tem.
 *
 * Roda no desktop e no celular (390 × 844), as duas dentro do projeto desktop e uma depois da
 * outra: o projeto mobile usaria a mesma Isabela ao mesmo tempo. Gasta 3 mensagens ao agent por
 * largura (o teto do E2E por IP está em playwright.config.ts).
 */
for (const view of [DESKTOP_VIEW, PHONE_VIEW]) {
  test(`R31, R18, RN08, RN09, RN14: chamado crítico transferido, assumido e devolvido, visto pelos dois lados (${view.name})`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "as duas larguras já rodam no projeto desktop; a mesma funcionária no projeto mobile colidiria com elas",
    );
    test.setTimeout(CONSOLE_FLOW_TIMEOUT_MS);
    const startedAt = new Date();
    const { baseURL } = testInfo.project.use;
    const tag = randomUUID().slice(0, 8);
    const employeeSession = await openSession(
      browser,
      baseURL,
      view,
      "isabela.martins@nexo.com.br",
    );
    const analystSession = await openSession(browser, baseURL, view, "rafael.lima@nexo.com.br");
    const employee = employeeSession.page;
    const analyst = analystSession.page;

    try {
      // Funcionária: o chamado sai crítico (a empresa toda parada), com prazo de 1 hora, e a
      // conversa passa sozinha para o analista (A04), com o contador pausado (RN14).
      const draft = await proposeDraft(
        employee,
        `Quero abrir um chamado: ${tag} servidor de arquivos fora do ar`,
      );
      await editDraft(employee, draft, { affected: "Toda a empresa" });
      await expect(cardField(draft, "Prioridade")).toContainText("Crítica");
      expectCriticalDeadline((await cardField(draft, "Prioridade").textContent()) ?? "", startedAt);
      await draft.getByRole("button", { name: /^Confirmar/ }).click();
      const created = draft.getByText(/^Criado · INC-\d{5}$/);
      await expect(created).toBeVisible();
      const ticketNumber = /INC-\d{5}/.exec((await created.textContent()) ?? "")?.[0] ?? "";
      expect(ticketNumber).not.toBe("");
      await expect(employee.getByText("Aguardando analista", { exact: true })).toBeVisible();
      await expect(
        employee.getByText(/^Conversa transferida para o Suporte N2 \(caso crítico\)/).last(),
      ).toBeVisible();
      const counter = employee.locator("#composer-counter");
      await expect(counter).toHaveText(
        /^Suas mensagens vão para o analista · contador pausado em \d+\/30$/,
      );
      const usedMessages = Number(
        /pausado em (\d+)\//.exec((await counter.textContent()) ?? "")?.[1],
      );
      const pausedCounterText = `Suas mensagens vão para o analista · contador pausado em ${usedMessages}/30`;

      // Analista: acha a conversa, e o chamado ligado a ela espera um analista.
      await analyst.getByRole("button", { name: /^Para você/ }).click();
      await analyst.getByRole("button", { name: /Isabela Martins/ }).click();
      await expect(analyst.getByRole("heading", { name: "Isabela Martins" })).toBeVisible();
      await expectLinkedTicket(analyst, view, {
        number: ticketNumber,
        status: "Aguardando analista",
      });

      // R31: ao assumir, o chamado passa a "em atendimento"; a funcionária vê quem a atende.
      await analyst.getByRole("button", { name: "Assumir atendimento" }).click();
      await expect(employee.getByText("Com Rafael Lima · Suporte N2")).toBeVisible({
        timeout: POLLING_TIMEOUT_MS,
      });
      await expectLinkedTicket(analyst, view, { number: ticketNumber, status: "Em atendimento" });

      // RN08, RN14: a funcionária escreve ao analista e o analista responde; o agent fica calado
      // (o aviso da resposta chegando é o ponto de espera) e o contador não anda.
      const agentAnswers = employee.getByRole("log").getByText("Nexo Assist", { exact: true });
      const agentAnswersBefore = await agentAnswers.count();
      const toAnalyst = `O servidor continua fora do ar (${tag})`;
      await employee.getByLabel("Mensagem para o analista").fill(toAnalyst);
      await employee.getByRole("button", { name: "Enviar" }).click();
      await expect(analyst.getByText(toAnalyst)).toBeVisible({ timeout: POLLING_TIMEOUT_MS });
      const reply = `Estou vendo o servidor aqui (${tag})`;
      await analyst.getByLabel("Resposta para Isabela").fill(reply);
      await analyst.getByRole("button", { name: "Enviar" }).click();
      await expect(employee.getByText(reply)).toBeVisible({ timeout: POLLING_TIMEOUT_MS });
      expect(await agentAnswers.count()).toBe(agentAnswersBefore);
      await expect(counter).toHaveText(pausedCounterText);

      // R18, A08: ao devolver, o chamado vai para "em andamento" e o assistente volta, com o
      // contador de onde parou.
      await analyst.getByRole("button", { name: "Devolver ao agent" }).click();
      await expect(employee.getByText("Assistente online")).toBeVisible({
        timeout: POLLING_TIMEOUT_MS,
      });
      await expect(
        employee.getByText("Rafael Lima devolveu a conversa ao assistente.").last(),
      ).toBeVisible();
      await expect(counter).toHaveText(`${usedMessages}/30 mensagens nesta sessão`);
      await expectLinkedTicket(analyst, view, { number: ticketNumber, status: "Em andamento" });

      // O agent responde de novo, e a funcionária vê o chamado no novo status e só os dela (RN09).
      const status = await askAgent(employee, "Qual o status do meu chamado?", TICKET_LIST_ANSWER);
      await expect(status).toContainText(
        new RegExp(`${ticketNumber} · .*${tag}.* \\(Em andamento\\)`),
      );
      await expect(status).not.toContainText(/INC-20311|INC-20298|INC-20480/);
      const foreign = await askAgent(
        employee,
        "Qual o status do INC-20311?",
        /^Não encontrei esse chamado entre os seus\./,
      );
      await expect(foreign).not.toContainText("Notebook lento");
      await expect(counter).toHaveText(`${usedMessages + 2}/30 mensagens nesta sessão`);
    } finally {
      await employeeSession.context.close();
      await analystSession.context.close();
    }
  });
}
