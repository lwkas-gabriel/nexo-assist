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
  // card novo (e não "o único"), para não confundir com o de um teste anterior.
  const byText = await proposeDraft(
    page,
    "Quero abrir um chamado: o notebook não liga desde hoje cedo",
  );
  await expect(page.getByText(/Montei o rascunho D-\d+/).last()).toBeVisible();
  await expect(page.getByText("montou o rascunho").last()).toBeVisible();

  await composer.fill("Confirmo, pode criar");
  await send.click();
  await expect(byText.getByText(/^Criado · INC-\d{5}$/)).toBeVisible();
  await expect(page.getByText(/chamado INC-\d{5} criado/).last()).toBeVisible();
  await expect(page.getByText("confirmou o rascunho", { exact: true }).last()).toBeVisible();

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
});

/**
 * RN04, ponta a ponta: o que o funcionário cancela ou ainda não confirmou não existe no sistema de
 * chamados, e o que ele edita e confirma nasce com o tipo, a prioridade e o prazo do rascunho
 * editado (RN01, RN11, RN12, R16). Gasta 4 mensagens ao agent por projeto (ver o teto por IP em
 * playwright.config.ts).
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
  // RN12: Baixa responde em 5 dias úteis; Alta, em 4 horas úteis.
  expect(editedDeadline.getTime()).toBeGreaterThan(proposedDeadline.getTime());
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

  // Confirmar: o chamado nasce REQ (tipo editado, RN01) e aparece para o funcionário, só o dele.
  await draft.getByRole("button", { name: /^Confirmar/ }).click();
  await expect(draft.getByText(/^Criado · REQ-\d{5}$/)).toBeVisible();
  const afterConfirming = await askAgent(page, "Qual o status do meu chamado?", TICKET_LIST_ANSWER);
  await expect(afterConfirming).toContainText(
    new RegExp(`REQ-\\d{5} · .*${tag} pasta do projeto.* \\(Novo\\)`),
  );
  await expect(afterConfirming).not.toContainText(`${tag} impressora`);

  const picker = page.getByRole("list", { name: "Seus chamados" }).last();
  await picker
    .getByRole("button", { name: new RegExp(`REQ-\\d{5}.*${tag} pasta do projeto`) })
    .click();
  const ticketCard = page.getByRole("region", { name: /^Chamado REQ-\d{5}$/ }).last();
  await expect(cardField(ticketCard, "Prioridade")).toHaveText("Baixa");
  await expect(ticketCard).toContainText("Novo");
});
