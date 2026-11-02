import { expect, type Locator, type Page } from "@playwright/test";

/** O campo do card ("Prioridade", "Tipo"...): o texto que fica ao lado do rótulo. */
export function cardField(card: Locator, label: string): Locator {
  return card.locator(`dt:text-is("${label}") + dd`);
}

const DRAFT_CARD_NAME = /^Rascunho D-\d+$/;

/**
 * Pede um chamado e devolve o card novo, já pronto para confirmar (o agent terminou de responder).
 * A conversa fica salva e a tela só guarda as últimas mensagens: o card novo é o que tem um número
 * que não estava lá antes, não "o que faz a contagem subir".
 */
export async function proposeDraft(page: Page, text: string): Promise<Locator> {
  const cards = page.getByRole("region", { name: DRAFT_CARD_NAME });
  const composer = page.getByLabel("Mensagem para o Nexo");
  // O campo só existe com a conversa carregada: olhar antes dele pegaria o histórico pela metade.
  await expect(composer).toBeVisible();
  const knownNames = await Promise.all(
    (await cards.all()).map((card) => card.getAttribute("aria-label")),
  );
  await composer.fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect
    .poll(async () => knownNames.includes(await cards.last().getAttribute("aria-label")))
    .toBe(false);
  const newName = (await cards.last().getAttribute("aria-label")) ?? "";
  const card = page.getByRole("region", { name: newName, exact: true });
  await expect(card.getByRole("button", { name: /^Confirmar/ })).toBeEnabled();
  return card;
}

/** R16: edita o rascunho pelo formulário do próprio card, sem o modelo, e espera o card voltar. */
export async function editDraft(
  page: Page,
  card: Locator,
  changes: { type?: string; affected?: string; urgency?: string },
) {
  await card.getByRole("button", { name: "Editar" }).click();
  const form = page.getByRole("form", { name: "Editar rascunho" });
  if (changes.type) await form.getByLabel("Tipo").selectOption({ label: changes.type });
  if (changes.affected) {
    await form.getByLabel("Quem é afetado").selectOption({ label: changes.affected });
  }
  if (changes.urgency) await form.getByLabel("Urgência").selectOption({ label: changes.urgency });
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(form).toBeHidden();
}

/**
 * Manda uma mensagem ao agent e devolve a resposta nova, que casa com `answerPattern`. A resposta
 * nova é a que muda o que havia (quantas e qual a última), pelo mesmo motivo do `proposeDraft`.
 */
export async function askAgent(page: Page, text: string, answerPattern: RegExp): Promise<Locator> {
  const answers = page.getByText(answerPattern);
  const composer = page.getByLabel("Mensagem para o Nexo");
  await expect(composer).toBeVisible();
  // Sem resposta ainda, a assinatura é só "0|": ler o texto da última esperaria uma que não existe.
  const signature = async () => {
    const count = await answers.count();
    return `${count}|${count === 0 ? "" : await answers.last().textContent()}`;
  };
  const before = await signature();
  await composer.fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect.poll(signature).not.toBe(before);
  return answers.last();
}

/**
 * A resposta do agent a "qual o status do meu chamado?" (lista dos chamados abertos). Termina com a
 * nota do modelo de teste: sem ela, a lista vazia casaria duas vezes (a bolha e o card "vazio").
 */
export const TICKET_LIST_ANSWER =
  /^Você (tem \d+ chamados abertos|não tem chamados abertos).*\(resposta do modelo de teste\)$/;
