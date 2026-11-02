import { randomUUID } from "node:crypto";
import { expect, test, type TestInfo } from "@playwright/test";
import { parseBrasiliaDeadline } from "./support/deadline.ts";
import {
  askAgent,
  cardField,
  editDraft,
  proposeDraft,
  TICKET_LIST_ANSWER,
} from "./support/drafts.ts";
import { loginAs } from "./support/login.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LOW_AFTER_HIGH_DAYS = 3.5;
const MAX_LOW_AFTER_HIGH_DAYS = 8;

function employeeEmailOf(testInfo: TestInfo): string {
  return testInfo.project.name === "mobile"
    ? "henrique.alves@nexo.com.br"
    : "gabriela.rocha@nexo.com.br";
}

/**
 * Abrir chamado de ponta a ponta (RF15, RN04): o agent monta o rascunho e só a confirmação do
 * funcionário (por texto, pelo botão do card ou por Ctrl/⌘+Enter) cria o chamado no
 * tickets-service. Cada projeto usa um funcionário próprio, para os testes em paralelo não
 * dividirem a conversa.
 */
test("RF15: abre um chamado conversando, conferindo o rascunho antes", async ({
  page,
}, testInfo) => {
  await loginAs(page, employeeEmailOf(testInfo));
  const composer = page.getByLabel("Mensagem para o Nexo");
  const send = page.getByRole("button", { name: "Enviar" });

  // A conversa fica salva e os testes deste arquivo dividem o funcionário: cada passo espera o
  // card novo (e não "o único"), identificado pelo número, e as linhas e etiquetas são contadas
  // antes e depois, para não aceitar as de um teste anterior.
  await expect(composer).toBeVisible();
  const proposedChips = page.getByText("montou o rascunho", { exact: true });
  const confirmedChips = page.getByText("confirmou o rascunho", { exact: true });
  const createdAnswers = page.getByText(/chamado INC-\d{5} criado/);
  const proposedBefore = await proposedChips.count();
  const createdAnswersBefore = await createdAnswers.count();
  const confirmedBefore = await confirmedChips.count();
  const byText = await proposeDraft(
    page,
    "Quero abrir um chamado: o notebook não liga desde hoje cedo",
  );
  const textDraftId = (await byText.getAttribute("aria-label"))?.replace("Rascunho ", "") ?? "";
  await expect(proposedChips).toHaveCount(proposedBefore + 1);
  await expect(page.getByText(new RegExp(`^Montei o rascunho ${textDraftId}:`))).toBeVisible();

  await composer.fill("Confirmo, pode criar");
  await send.click();
  await expect(byText.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();
  await expect(createdAnswers).toHaveCount(createdAnswersBefore + 1);
  await expect(confirmedChips).toHaveCount(confirmedBefore + 1);

  // RN04 pelo botão do card (11.5): sem passar pelo modelo.
  const byButton = await proposeDraft(
    page,
    "Preciso abrir um chamado: o monitor externo não dá imagem",
  );
  await byButton.getByRole("button", { name: /^Confirmar/ }).click();
  await expect(byButton.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();

  // R33: Ctrl/⌘+Enter no campo de mensagem confirma o rascunho pendente.
  const byShortcut = await proposeDraft(
    page,
    "Quero abrir um chamado: o teclado do notebook falha em algumas teclas",
  );
  await composer.press("ControlOrMeta+Enter");
  await expect(byShortcut.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();

  // Os três rascunhos seguem "Criado" depois das ações seguintes (cada um preso ao próprio número).
  for (const card of [byText, byButton, byShortcut]) {
    await expect(card.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();
  }
});

/**
 * RN04, ponta a ponta: o que o funcionário cancela ou ainda não confirmou não existe no sistema de
 * chamados, e o que ele edita e confirma nasce com o tipo, a prioridade e o prazo do rascunho
 * editado (RN01, RN11, RN12, R16). Gasta 4 mensagens ao agent por projeto.
 */
test("RF07, R16, RN04: edita e cancela rascunhos, e só o confirmado vira chamado", async ({
  page,
}, testInfo) => {
  await loginAs(page, employeeEmailOf(testInfo));
  // As conversas ficam salvas: a marca única separa os rascunhos deste teste dos de outros.
  const tag = randomUUID().slice(0, 8);

  // Cancelar: o rascunho fica no histórico como cancelado, sem ações e sem prazo.
  const cancelled = await proposeDraft(
    page,
    `Quero abrir um chamado: ${tag} impressora do andar: não imprime`,
  );
  await cancelled.getByRole("button", { name: "Cancelar" }).click();
  await expect(cancelled.getByText("Cancelado", { exact: true })).toBeVisible();
  await expect(cancelled.getByRole("button")).toHaveCount(0);
  await expect(cancelled).not.toContainText("resposta até");

  // Editar (R16): o card mostra o que o modelo propôs (Incidente, Alta) e, depois da edição, o
  // que a pessoa escolheu, com a prioridade e o prazo recalculados pelo código.
  const draft = await proposeDraft(
    page,
    `Quero abrir um chamado: ${tag} pasta do projeto: preciso de acesso`,
  );
  await expect(cardField(draft, "Tipo")).toHaveText("Incidente");
  await expect(cardField(draft, "Prioridade")).toContainText("Alta");
  const proposedDeadline = parseBrasiliaDeadline(
    (await cardField(draft, "Prioridade").textContent()) ?? "",
  );
  await editDraft(page, draft, { type: "Requisição", urgency: "pedido sem urgência" });
  await expect(cardField(draft, "Tipo")).toHaveText("Requisição");
  await expect(cardField(draft, "Prioridade")).toContainText("Baixa");
  const editedDeadline = parseBrasiliaDeadline(
    (await cardField(draft, "Prioridade").textContent()) ?? "",
  );
  // RN12: Alta responde em 4 horas úteis e Baixa em 5 dias úteis. O valor exato depende do
  // calendário útil e tem teste unitário (sla.test.ts); aqui vale a distância, que não depende do
  // dia da semana: ao menos 3,5 dias (uma Baixa com o prazo da Média, de 3 dias úteis, não passa)
  // e no máximo 8.
  const gapInDays = (editedDeadline.getTime() - proposedDeadline.getTime()) / DAY_MS;
  expect(gapInDays).toBeGreaterThanOrEqual(MIN_LOW_AFTER_HIGH_DAYS);
  expect(gapInDays).toBeLessThanOrEqual(MAX_LOW_AFTER_HIGH_DAYS);
  // O histórico guarda cada edição; a deste rascunho tem o número dele.
  const draftId = (await draft.getAttribute("aria-label"))?.replace("Rascunho ", "");
  await expect(
    page.getByText(`Rascunho ${draftId} editado pelo funcionário. Prioridade: Baixa.`),
  ).toBeVisible();

  // RN04: com um rascunho cancelado e outro pendente, o sistema de chamados não tem nenhum dos dois.
  const beforeConfirming = await askAgent(
    page,
    "Qual o status do meu chamado?",
    TICKET_LIST_ANSWER,
  );
  await expect(beforeConfirming).not.toContainText(tag);

  // Confirmar: o chamado nasce REQ (tipo editado, RN01) e aparece para o funcionário, e só os
  // dele (RN09): nenhum dos chamados de demonstração de outras pessoas.
  await draft.getByRole("button", { name: /^Confirmar/ }).click();
  const created = draft.getByText(/^Criado · REQ-\d{5}$/);
  await expect(created).toBeVisible();
  const ticketNumber = /REQ-\d{5}/.exec((await created.textContent()) ?? "")?.[0] ?? "";
  expect(ticketNumber).not.toBe("");
  const afterConfirming = await askAgent(page, "Qual o status do meu chamado?", TICKET_LIST_ANSWER);
  await expect(afterConfirming).toContainText(
    new RegExp(`${ticketNumber} · [^;]*${tag} pasta do projeto[^;]* \\(Novo\\)`),
  );
  await expect(afterConfirming).not.toContainText(`${tag} impressora`);
  await expect(afterConfirming).not.toContainText(/INC-20311|INC-20298|INC-20480/);

  await page
    .getByRole("list", { name: "Seus chamados" })
    .getByRole("button", { name: new RegExp(ticketNumber) })
    .click();
  const ticketCard = page.getByRole("region", { name: `Chamado ${ticketNumber}`, exact: true });
  await expect(cardField(ticketCard, "Prioridade")).toHaveText("Baixa");
  await expect(ticketCard).toContainText("Novo");
});
