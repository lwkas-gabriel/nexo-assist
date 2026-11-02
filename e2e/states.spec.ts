import { expect, test } from "@playwright/test";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

/**
 * Estados de erro e vazio de ponta a ponta (RF23, 10.5), derrubando a rede com `page.route`.
 * Ninguém envia mensagem aqui: as contas são compartilhadas com os outros testes, que rodam em
 * paralelo (a Ana no chat, a Juliana Costa só olhando o console), e entram pela sessão guardada
 * pelo projeto `setup` (ver `support/shared-sessions.ts`).
 *
 * O "sistema de chamados instável" e a "resposta interrompida" ficam só nos testes unitários: o E2E
 * roda com FAILURE_RATE=0 e não reinicia o servidor no meio de um turno.
 */
const NETWORK_ERROR_TEXT = /Não foi possível falar com o servidor/;
const LIST_URL = /\/api\/console\/conversations\?/;
/** Quanto o relógio da página avança antes de parar, e quanto anda depois do clique (bem menos que os 3 s do polling). */
const PAUSE_AHEAD_MS = 1000;
const CLOCK_STEP_MS = 50;
const SESSION_EXPIRED_TEXT = "Sua sessão expirou. Entre de novo para continuar.";

test("api fora do ar na abertura: erro com Tentar novamente, e voltando mostra o login", async ({
  page,
}) => {
  await page.route(/\/api\/auth\/me$/, (route) => route.abort("internetdisconnected"));
  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(NETWORK_ERROR_TEXT);

  await page.unroute(/\/api\/auth\/me$/);
  await page.getByRole("button", { name: "Tentar novamente" }).click();

  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
});

test.describe("funcionário", () => {
  test.use({ storageState: SHARED_SESSIONS.ana.file });

  test("erro de rede ao carregar a conversa: alerta e Tentar novamente carrega o chat", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();
    // Só `/api/chat`: o `$` deixa de fora `/api/chat/messages` e as ações do chat.
    await page.route(/\/api\/chat$/, (route) => route.abort("internetdisconnected"));
    await page.reload();

    await expect(page.getByRole("alert")).toContainText(NETWORK_ERROR_TEXT);
    await expect(page.getByText("Assistente online")).toBeHidden();

    await page.unroute(/\/api\/chat$/);
    await page.getByRole("button", { name: "Tentar novamente" }).click();

    // O log pode estar vazio (sem altura) numa conversa nova: basta existir, e o campo aparecer.
    await expect(page.getByRole("log", { name: "Conversa com o Nexo Assist" })).toBeAttached();
    await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();
    await expect(page.getByText("Assistente online")).toBeVisible();
  });

  test("sessão expirada: a api responde 401 e a pessoa volta ao login com o aviso", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByLabel("Mensagem para o Nexo")).toBeVisible();
    await page.route(/\/api\/chat$/, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Faça login para continuar." },
        }),
      }),
    );
    await page.reload();

    await expect(page.getByText(SESSION_EXPIRED_TEXT)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });
});

test.describe("analista", () => {
  test.use({ storageState: SHARED_SESSIONS.juliana.file });

  test("console: busca sem resultado diz o que foi buscado, e Limpar busca esvazia o campo", async ({
    page,
  }) => {
    await page.goto("/");
    const search = page.getByLabel("Pesquisar conversa ou chamado");

    await search.fill("zzzz-sem-resultado");

    await expect(page.getByText(/Nenhuma conversa encontrada para/)).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByText(/Nenhuma conversa encontrada para/)).toBeHidden();
  });

  test("console: erro de rede na lista mostra o alerta, e só o botão Tentar novamente o tira", async ({
    page,
  }) => {
    // O console refaz a lista sozinho a cada 3 s, e isso também a recuperaria. Com o relógio da
    // página parado, só o clique no botão pode fazer a lista voltar.
    await page.clock.install();
    await page.goto("/");
    await expect(page.getByLabel("Pesquisar conversa ou chamado")).toBeVisible();
    await page.route(LIST_URL, (route) => route.abort("internetdisconnected"));
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(NETWORK_ERROR_TEXT);

    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + PAUSE_AHEAD_MS));
    await page.unroute(LIST_URL);
    const reloaded = page.waitForResponse(LIST_URL);
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await reloaded;
    await page.clock.runFor(CLOCK_STEP_MS);

    await expect(page.getByRole("alert")).toBeHidden();
    await expect(page.getByRole("button", { name: /^Todas/ })).toBeVisible();
  });
});
