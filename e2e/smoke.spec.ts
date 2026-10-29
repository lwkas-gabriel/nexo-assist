import { expect, test } from "@playwright/test";

test("a aplicação abre na tela de login", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Nexo Assist" })).toBeVisible();
  await expect(page.getByLabel("E-mail corporativo")).toBeVisible();
});

test("o front alcança a api pelo proxy /api", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
