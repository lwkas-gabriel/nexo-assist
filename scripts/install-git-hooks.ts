/**
 * Aponta o git para os hooks versionados em .githooks/ (roda sozinho no `pnpm install`).
 * Fora de um repositório git (ex.: build de deploy), não faz nada.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..");

if (existsSync(join(repoRoot, ".git"))) {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: repoRoot });
  console.log("Hooks do git ativados (.githooks/)");
}
