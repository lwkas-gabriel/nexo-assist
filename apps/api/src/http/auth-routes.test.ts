import { describe, expect, it } from "vitest";
import { createContainer } from "../container.ts";
import { createTestApp, testConfig } from "../test-support.ts";

const ANA_EMAIL = "ana.souza@nexo.com.br";

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    path,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  };
}

describe("login", () => {
  it("RF01: aceita funcionário de demonstração com qualquer senha", async () => {
    const { app } = await createTestApp();
    const { path, init } = postJson("/api/auth/login", { email: ANA_EMAIL, password: "x" });

    const response = await app.request(path, init);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        id: "emp-ana-souza",
        name: "Ana Souza",
        email: ANA_EMAIL,
        role: "employee",
        department: "Financeiro",
      },
    });
  });

  it("cookie de sessão protegido: HttpOnly, SameSite=Lax e válido no site inteiro", async () => {
    const { app } = await createTestApp();
    const { path, init } = postJson("/api/auth/login", { email: ANA_EMAIL, password: "x" });

    const cookie = (await app.request(path, init)).headers.get("set-cookie") ?? "";

    expect(cookie).toMatch(/^nexo_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // Sem "manter conectado", o cookie acaba quando o navegador fecha.
    expect(cookie).not.toContain("Expires");
  });

  it("com 'manter conectado', o cookie sobrevive ao navegador fechar", async () => {
    const { app } = await createTestApp();
    const { path, init } = postJson("/api/auth/login", {
      email: ANA_EMAIL,
      password: "x",
      remember: true,
    });

    const cookie = (await app.request(path, init)).headers.get("set-cookie") ?? "";

    expect(cookie).toContain("Expires=");
  });

  it("R44: e-mail desconhecido recebe a mesma mensagem genérica (não revela quem tem conta)", async () => {
    const { app } = await createTestApp();
    const { path, init } = postJson("/api/auth/login", {
      email: "nao.existe@nexo.com.br",
      password: "x",
    });

    const response = await app.request(path, init);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." },
    });
  });

  it("aceita o e-mail com maiúsculas e espaços", async () => {
    const { app } = await createTestApp();
    const { path, init } = postJson("/api/auth/login", {
      email: "  ANA.Souza@nexo.com.br ",
      password: "x",
    });

    expect((await app.request(path, init)).status).toBe(200);
  });

  it("recusa senha vazia", async () => {
    const { app } = await createTestApp();
    const { path, init } = postJson("/api/auth/login", { email: ANA_EMAIL, password: "" });

    expect((await app.request(path, init)).status).toBe(400);
  });
});

describe("sessão", () => {
  it("/me devolve quem está logado", async () => {
    const { app, login } = await createTestApp();
    const cookie = await login(ANA_EMAIL);

    const response = await app.request("/api/auth/me", { headers: { Cookie: cookie } });

    expect(await response.json()).toMatchObject({ user: { id: "emp-ana-souza" } });
  });

  it("/me sem login responde 401", async () => {
    const { app } = await createTestApp();

    const response = await app.request("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("depois do logout, o cookie antigo não vale mais", async () => {
    const { app, login } = await createTestApp();
    const cookie = await login(ANA_EMAIL);

    await app.request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } });
    const response = await app.request("/api/auth/me", { headers: { Cookie: cookie } });

    expect(response.status).toBe(401);
  });

  it("a sessão sem 'manter conectado' expira depois de um expediente (12 h)", async () => {
    let now = new Date("2026-10-29T09:00:00Z");
    const container = await createContainer(testConfig(), { now: () => now });
    const { app, login } = await createTestApp(container);
    const cookie = await login(ANA_EMAIL);

    now = new Date("2026-10-29T21:00:01Z");
    const response = await app.request("/api/auth/me", { headers: { Cookie: cookie } });

    expect(response.status).toBe(401);
  });
});
