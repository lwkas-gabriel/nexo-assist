import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-support.ts";

/**
 * T10b: as garantias de segurança da api, num só lugar.
 * (A recusa do serviço de chamados sem token está em apps/tickets-service/src/app.test.ts.)
 */

const ANA = "ana.souza@nexo.com.br";
const BRUNO = "bruno.tavares@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";

async function setup() {
  const { app, login } = await createTestApp();
  const get = (path: string, cookie?: string) =>
    app.request(path, { headers: cookie ? { Cookie: cookie } : {} });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { app, login, get, post };
}

describe("RN09: um funcionário nunca vê a conversa de outro", () => {
  it("a conversa da Ana não aparece para o Bruno", async () => {
    const { login, get, post } = await setup();
    const ana = await login(ANA);
    const bruno = await login(BRUNO);
    await (
      await post("/api/chat/messages", { text: "Minha senha do SAP" }, { Cookie: ana })
    ).text();

    const brunoView = await get("/api/chat", bruno);

    expect(await brunoView.json()).toEqual({
      conversation: null,
      session: null,
      messages: [],
      drafts: [],
    });
  });

  it("não existe rota que receba o id da conversa ou do usuário do navegador", async () => {
    const { login, get } = await setup();
    const bruno = await login(BRUNO);

    // A conversa é sempre a do usuário da sessão; ids na URL são ignorados (rota inexistente).
    const response = await get("/api/chat/emp-ana-souza", bruno);

    expect(response.status).toBe(404);
  });
});

describe("A07 e A15: papéis", () => {
  it("funcionário não acessa o console do analista", async () => {
    const { login, get } = await setup();

    const response = await get("/api/console/conversations", await login(ANA));

    expect(response.status).toBe(403);
  });

  it("analista acessa o console e vê as conversas em andamento", async () => {
    const { login, get, post } = await setup();
    const ana = await login(ANA);
    await (await post("/api/chat/messages", { text: "VPN com erro 809" }, { Cookie: ana })).text();

    const response = await get("/api/console/conversations", await login(RAFAEL));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      conversations: [{ mode: "agent", employee: { name: "Ana Souza", department: "Financeiro" } }],
    });
  });

  it("sem login, nem chat nem console", async () => {
    const { get } = await setup();

    const responses = await Promise.all([get("/api/chat"), get("/api/console/conversations")]);

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
  });

  it("cookie de sessão inventado não autentica", async () => {
    const { get } = await setup();

    const response = await get("/api/auth/me", "nexo_session=token-inventado");

    expect(response.status).toBe(401);
  });
});

describe("CSRF: escritas vindas de outro site", () => {
  it("são recusadas, mesmo com um cookie de sessão válido", async () => {
    const { login, post } = await setup();
    const ana = await login(ANA);

    const response = await post(
      "/api/chat/messages",
      { text: "mensagem forjada" },
      { Cookie: ana, Origin: "https://site-malicioso.example", Host: "localhost" },
    );

    expect(response.status).toBe(403);
  });

  it("da mesma origem passam normalmente", async () => {
    const { post } = await setup();

    const response = await post(
      "/api/auth/login",
      { email: ANA, password: "x" },
      { Origin: "http://localhost:3000", Host: "localhost:3000" },
    );

    expect(response.status).toBe(200);
  });
});

describe("sessões", () => {
  it("cada login gera um token novo (não reaproveita sessão)", async () => {
    const { login } = await setup();

    const first = await login(ANA);
    const second = await login(ANA);

    expect(first).not.toBe(second);
  });
});
