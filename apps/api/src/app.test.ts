import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createTestContainer } from "./test-support.ts";

const container = createTestContainer();

/** Simula um build do front numa pasta temporária. */
function createFakeWebDist() {
  const directory = mkdtempSync(join(tmpdir(), "nexo-web-dist-"));
  writeFileSync(join(directory, "index.html"), "<h1>Nexo Assist</h1>");
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "assets", "app.js"), "console.log('app')");
  return directory;
}

describe("api", () => {
  it("responde ao health check em /api/health", async () => {
    const response = await createApp(container).request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("responde 404 em JSON para rota de api inexistente", async () => {
    const response = await createApp(container).request("/api/nao-existe");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("envia cabeçalhos de segurança", async () => {
    const response = await createApp(container).request("/api/health");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("front em produção", () => {
  const app = createApp(container, { webDistDirectory: createFakeWebDist() });

  it("entrega o index.html na raiz", async () => {
    const response = await app.request("/");

    expect(await response.text()).toContain("Nexo Assist");
  });

  it("entrega os arquivos estáticos do build", async () => {
    const response = await app.request("/assets/app.js");

    expect(await response.text()).toContain("console.log");
  });

  it("abre o index.html em rotas do front (SPA)", async () => {
    const response = await app.request("/console/conversa-123");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Nexo Assist");
  });

  it("não troca rota de api inexistente pelo index.html", async () => {
    const response = await app.request("/api/nao-existe");

    expect(response.status).toBe(404);
  });

  it("não expõe arquivos fora da pasta do build (path traversal)", async () => {
    for (const path of [
      "/../package.json",
      "/..%2f..%2fpackage.json",
      "/%2e%2e/%2e%2e/package.json",
    ]) {
      const body = await (await app.request(path)).text();

      expect(body).not.toContain('"dependencies"');
    }
  });
});
