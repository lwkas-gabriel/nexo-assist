import { expect, test } from "@playwright/test";

test("a aplicação abre e mostra o nome do produto", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Nexo Assist" })).toBeVisible();
});

test("o front alcança a api pelo proxy /api", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
