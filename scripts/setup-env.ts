/**
 * Prepara o .env de cada app a partir do .env.example (uso: pnpm setup:env).
 * - Cria o .env se não existir; se existir, só acrescenta variáveis novas (nunca sobrescreve).
 * - Gera localmente os segredos compartilhados entre apps (o mesmo valor nos dois lados).
 * Nunca imprime valores de segredos.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeEnvFile, readEnvValues } from "./env-file.ts";

const appsDir = join(import.meta.dirname, "..", "apps");

/** Segredos gerados aqui: cada um vale para todos os pares app/variável listados. */
const SHARED_SECRETS = [
  [
    { app: "tickets-service", key: "SERVICE_TOKEN" },
    { app: "api", key: "TICKETS_SERVICE_TOKEN" },
  ],
];

const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);
const envPath = (app: string) => join(appsDir, app, ".env");

/** Reaproveita o valor que já existir em algum dos lados; senão, gera um novo. */
const secretsByApp = new Map<string, Record<string, string>>();
for (const locations of SHARED_SECRETS) {
  const existing = locations
    .map(({ app, key }) => readEnvValues(readIfExists(envPath(app))).get(key))
    .find((value) => value !== undefined);
  const value = existing ?? randomBytes(32).toString("hex");
  for (const { app, key } of locations) {
    secretsByApp.set(app, { ...secretsByApp.get(app), [key]: value });
  }
}

for (const app of readdirSync(appsDir)) {
  const example = readIfExists(join(appsDir, app, ".env.example"));
  if (example === undefined) continue;

  const current = readIfExists(envPath(app));
  const { content, addedKeys, filledSecrets } = mergeEnvFile(
    example,
    current,
    secretsByApp.get(app) ?? {},
  );
  if (current === content) {
    console.log(`apps/${app}/.env já está completo`);
    continue;
  }

  writeFileSync(envPath(app), content);
  const details = [
    current === undefined ? "criado a partir do .env.example" : "",
    addedKeys.length > 0 ? `variáveis novas: ${addedKeys.join(", ")}` : "",
    filledSecrets.length > 0 ? `segredos gerados: ${filledSecrets.join(", ")}` : "",
  ].filter(Boolean);
  console.log(`apps/${app}/.env ${details.join("; ")}`);
}
