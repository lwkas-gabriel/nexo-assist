/**
 * Cria o .env de cada app a partir do .env.example, sem sobrescrever um .env existente.
 * Uso: pnpm setup:env
 */
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const appsDir = join(import.meta.dirname, "..", "apps");

for (const app of readdirSync(appsDir)) {
  const example = join(appsDir, app, ".env.example");
  const target = join(appsDir, app, ".env");

  if (!existsSync(example)) continue;
  if (existsSync(target)) {
    console.log(`apps/${app}/.env já existe, mantido como está`);
    continue;
  }
  copyFileSync(example, target);
  console.log(`apps/${app}/.env criado a partir do .env.example`);
}
