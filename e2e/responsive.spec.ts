import { expect, test, type Locator, type Page } from "@playwright/test";
import { DECIDED_TICKET_MESSAGE, forgeConversation } from "./support/chat-fixture.ts";
import { forgeWaitingConversation } from "./support/console-fixture.ts";
import { horizontalOverflowOf } from "./support/overflow.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Larguras em volta de cada breakpoint (10.6): 767/768, 1023/1024 e 1279/1280, mais valores no meio
 * de cada faixa. Em cada uma: sem rolagem lateral e o layout da tabela do 10.6. As conversas são
 * forjadas na leitura (`page.route`), então nada é enviado nem gravado nas contas compartilhadas.
 * Roda só no projeto desktop: o teste escolhe a largura, e a emulação de celular do outro projeto
 * encolheria a página em vez de estourá-la.
 */
const WIDTHS = [390, 767, 768, 800, 900, 1023, 1024, 1279, 1280, 1440];
const VIEWPORT_HEIGHT = 900;
const TABLET_MIN = 768;
const LAPTOP_MIN = 1024;
const DESKTOP_MIN = 1280;
const RAIL_WIDTH = 64;
const SIDEBAR_WIDTH = 232;
const CONSOLE_LIST_WIDTH = 380;
const DECISION_PANEL_WIDTH = 360;
const TICKETS_PANEL_WIDTH = 340;
const PHONE_SIDE_PADDING = 16;
const TABLET_SIDE_PADDING = 48;
const DESKTOP_SIDE_PADDING = 200;
const NO_SESSION = { cookies: [], origins: [] };
/** Meio pixel de folga para as medidas fracionárias do navegador. */
const TOLERANCE = 1;
/** Abaixo disso o motivo do atendimento vira uma coluna de poucas palavras por linha. */
const MIN_HANDOFF_TEXT_WIDTH = 150;

test.skip(
  ({ isMobile }) => isMobile,
  "a largura é do teste, e a emulação de celular encolheria a página",
);

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Elemento sem caixa na tela.");
  return box;
}

async function expectNoHorizontalScroll(page: Page, width: number) {
  const pageScrollWidth = await page.evaluate("document.documentElement.scrollWidth");
  expect(pageScrollWidth).toBeLessThanOrEqual(width);
  expect(await horizontalOverflowOf(page)).toEqual([]);
}

/** Quanto a coluna principal recua a conversa à esquerda (o padding lateral do 10.6). */
async function conversationSidePadding(page: Page) {
  const log = await boxOf(page.getByRole("log", { name: "Conversa com o Nexo Assist" }));
  const main = await boxOf(page.getByRole("main"));
  return Math.round(log.x - main.x);
}

function chatSidePadding(width: number, hasOpenPanel: boolean) {
  if (width < TABLET_MIN) return PHONE_SIDE_PADDING;
  return width >= DESKTOP_MIN && !hasOpenPanel ? DESKTOP_SIDE_PADDING : TABLET_SIDE_PADDING;
}

for (const width of WIDTHS) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    test.describe("login", () => {
      test.use({ storageState: NO_SESSION });

      test("sem rolagem lateral; o painel de apresentação só a partir de 1024 px", async ({
        page,
      }) => {
        await page.goto("/");
        await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();

        const showcase = page.getByRole("region", { name: "Sobre o Nexo Assist" });
        if (width >= LAPTOP_MIN) await expect(showcase).toBeVisible();
        else await expect(showcase).toBeHidden();
        await expectNoHorizontalScroll(page, width);
      });
    });

    test.describe("chat do funcionário", () => {
      test.use({ storageState: SHARED_SESSIONS.ana.file });

      test("navegação lateral, trilho ou topo, e o recuo lateral da conversa", async ({ page }) => {
        await page.goto("/");
        await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();

        const navigation = page.getByRole("navigation", { name: "Navegação principal" });
        if (width < TABLET_MIN) {
          await expect(navigation).toBeHidden();
          await expect(page.getByRole("link", { name: "Meu perfil" })).toBeVisible();
        } else {
          const expectedWidth = width >= LAPTOP_MIN ? SIDEBAR_WIDTH : RAIL_WIDTH;
          expect((await boxOf(navigation)).width).toBeCloseTo(expectedWidth, 0);
        }
        expect(await conversationSidePadding(page)).toBe(chatSidePadding(width, false));
        await expectNoHorizontalScroll(page, width);
      });

      test("o detalhe da decisão: coluna, gaveta ou folha, e o recuo da conversa", async ({
        page,
      }) => {
        await forgeConversation(page, { messages: [DECIDED_TICKET_MESSAGE] });
        await page.goto("/");
        await page.getByRole("button", { name: "detalhes da decisão" }).first().click();

        if (width >= DESKTOP_MIN) {
          const column = page.getByRole("complementary", { name: "Detalhe da decisão" });
          await expect(column).toBeVisible();
          expect((await boxOf(column)).width).toBeCloseTo(DECISION_PANEL_WIDTH, 0);
          await expect(page.getByRole("dialog")).toHaveCount(0);
        } else {
          const overlay = page.getByRole("dialog", { name: "Detalhe da decisão" });
          await expect(overlay).toBeVisible();
          const box = await boxOf(overlay);
          if (width >= TABLET_MIN) {
            // Gaveta à direita, no máximo 340 px e 90% da tela.
            expect(box.x + box.width).toBeCloseTo(width, 0);
            expect(box.width).toBeLessThanOrEqual(DECISION_PANEL_WIDTH + TOLERANCE);
          } else {
            // Folha que sobe de baixo, na largura toda.
            expect(box.width).toBeCloseTo(width, 0);
            expect(box.y + box.height).toBeCloseTo(VIEWPORT_HEIGHT, 0);
          }
        }
        // Com o detalhe aberto a conversa recua 48 px mesmo no desktop (10.6).
        const isInlineColumn = width >= DESKTOP_MIN;
        if (isInlineColumn) expect(await conversationSidePadding(page)).toBe(TABLET_SIDE_PADDING);
        await expectNoHorizontalScroll(page, width);
      });
    });

    test.describe("console do analista", () => {
      test.use({ storageState: SHARED_SESSIONS.juliana.file });

      test("lista, conversa e chamados: colunas, gaveta ou uma tela por vez", async ({ page }) => {
        await forgeWaitingConversation(page);
        await page.goto("/");
        // Pelo texto da última mensagem: depois de abrir, "Chamados de Ana Souza" também casaria com o nome.
        const listItem = page.getByRole("button", { name: /Quero falar com um analista/ });
        await expect(listItem).toBeVisible();
        const rail = page.getByRole("navigation", { name: "Navegação do console" });

        if (width < TABLET_MIN) {
          await expect(rail).toBeHidden();
          expect((await boxOf(listItem)).width).toBeLessThanOrEqual(width);
        } else {
          expect((await boxOf(rail)).width).toBeCloseTo(RAIL_WIDTH, 0);
        }
        await expectNoHorizontalScroll(page, width);

        await listItem.click();
        const conversation = page.getByRole("log", { name: "Conversa com Ana Souza" });
        await expect(conversation).toBeVisible();
        if (width < TABLET_MIN) {
          // Uma coluna por vez: a lista some e a conversa ocupa a tela.
          await expect(listItem).toBeHidden();
          expect((await boxOf(conversation)).width).toBeGreaterThan(width - 2 * RAIL_WIDTH);
        } else {
          await expect(listItem).toBeVisible();
          const list = await boxOf(page.getByRole("heading", { level: 2, name: "Ana Souza" }));
          expect(list.x).toBeGreaterThanOrEqual(RAIL_WIDTH + CONSOLE_LIST_WIDTH - TOLERANCE);
        }

        const handoffProblem = page.getByText("Notebook lento há 6 dias, sem resposta da TI.", {
          exact: true,
        });
        expect((await boxOf(handoffProblem)).width).toBeGreaterThanOrEqual(MIN_HANDOFF_TEXT_WIDTH);

        const panel = page.getByRole("complementary", { name: "Chamados de Ana" });
        const openTickets = page.getByRole("button", { name: "Chamados de Ana Souza" });
        if (width >= DESKTOP_MIN) {
          await expect(panel).toBeVisible();
          expect((await boxOf(panel)).width).toBeCloseTo(TICKETS_PANEL_WIDTH, 0);
        } else {
          await expect(panel).toHaveCount(0);
          await openTickets.click();
          const drawer = page.getByRole("dialog", { name: "Chamados de Ana" });
          await expect(drawer).toBeVisible();
          const box = await boxOf(drawer);
          if (width >= TABLET_MIN) expect(box.x + box.width).toBeCloseTo(width, 0);
          else expect(box.width).toBeCloseTo(width, 0);
        }
        await expectNoHorizontalScroll(page, width);
      });
    });
  });
}
