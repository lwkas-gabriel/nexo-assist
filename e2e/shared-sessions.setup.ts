import { test as setup } from "@playwright/test";
import { loginAs } from "./support/login.ts";
import { SHARED_SESSIONS } from "./support/shared-sessions.ts";

// Roda antes dos projetos de teste (dependência no playwright.config.ts).
for (const [name, { email, file }] of Object.entries(SHARED_SESSIONS)) {
  setup(`sessão compartilhada de ${name}`, async ({ page }) => {
    await loginAs(page, email);
    await page.context().storageState({ path: file });
  });
}
