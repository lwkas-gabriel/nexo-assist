import { expect, type Locator, type Page } from "@playwright/test";

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
