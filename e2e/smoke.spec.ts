import { expect, test } from "@playwright/test";

test("a aplicação abre na tela de login", async ({ page }) => {
  await page.goto("/");

  // Tela 1 do protótipo: o título é "Entrar"; a marca fica no painel escuro ou, no celular, no topo.
  await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  await expect(
    page.getByText("Nexo Assist", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("E-mail corporativo")).toBeVisible();
});

test("o front alcança a api pelo proxy /api", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
