import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemClock } from "@nexo/shared/domain";
import { describe, expect, it } from "vitest";
import { createContainer } from "../container.ts";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  sampleTicket,
  testConfig,
} from "../test-support.ts";
import { decisionTraces } from "../db/schema.ts";
import { createRateLimiter } from "./rate-limiter.ts";

const ANA_EMAIL = "ana.souza@nexo.com.br";

type ConversationResponse = {
  conversation: { id: string; mode: string } | null;
  messages: { role: string; parts: { type: string; text?: string }[] }[];
};

/** App de teste já com a Ana logada e ajudantes para conversar. */
async function loggedInAsAna(container?: Awaited<ReturnType<typeof createContainer>>) {
  const { app, login } = await createTestApp(container);
  const cookie = await login(ANA_EMAIL);

  const send = (body: unknown) =>
    app.request("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  const conversation = async () =>
    (await (
      await app.request("/api/chat", { headers: { Cookie: cookie } })
    ).json()) as ConversationResponse;

  return { app, cookie, send, conversation };
}

describe("chat do funcionário", () => {
  it("exige login", async () => {
    const { app } = await createTestApp();

    const response = await app.request("/api/chat");

    expect(response.status).toBe(401);
  });

  it("analista não usa o chat do funcionário", async () => {
    const { app, login } = await createTestApp();
    const cookie = await login("rafael.lima@nexo.com.br");

    const response = await app.request("/api/chat", { headers: { Cookie: cookie } });

    expect(response.status).toBe(403);
  });

  it("antes da primeira mensagem, não há conversa", async () => {
    const { conversation } = await loggedInAsAna();

    expect(await conversation()).toEqual({ conversation: null, session: null, messages: [] });
  });

  it("responde em streaming e grava a mensagem e a resposta (com as ações do agent)", async () => {
    const { send, conversation } = await loggedInAsAna();

    const response = await send({ text: "Qual o horário do service desk?" });
    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(stream).toContain("search_knowledge_base");
    const saved = await conversation();
    expect(saved.conversation).toMatchObject({ mode: "agent" });
    expect(saved.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(saved.messages[1]?.parts.map((part) => part.type)).toContain(
      "tool-search_knowledge_base",
    );
  });

  it("RT06: a conversa sobrevive a um reinício da api (mesmo banco, novo processo)", async () => {
    const databaseUrl = `file:${join(mkdtempSync(join(tmpdir(), "nexo-api-")), "api.db")}`;
    const config = testConfig({ DATABASE_URL: databaseUrl });

    const before = await loggedInAsAna(await createContainer(config));
    await (await before.send({ text: "Minha VPN dá erro 809" })).text();
    const after = await loggedInAsAna(await createContainer(config));

    const saved = await after.conversation();
    expect(saved.messages).toHaveLength(2);
    expect(saved.messages[0]?.parts[0]?.text).toBe("Minha VPN dá erro 809");
  });

  it("recusa mensagem vazia, longa demais ou JSON malformado com 400", async () => {
    const { app, cookie, send } = await loggedInAsAna();

    const empty = await send({ text: "   " });
    const tooLong = await send({ text: "a".repeat(2001) });
    const malformed = await app.request("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{ isso não é json",
    });

    expect([empty.status, tooLong.status, malformed.status]).toEqual([400, 400, 400]);
  });

  it("bloqueia com 429 quem passa do limite de mensagens", async () => {
    const container = await createContainer(testConfig());
    container.chatLimits.perUser = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      clock: systemClock,
    });
    const { send } = await loggedInAsAna(container);

    await (await send({ text: "oi" })).text();
    const blocked = await send({ text: "oi de novo" });

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("RN09: a consulta de chamados pelo chat usa o funcionário da sessão (rota → agent → tool)", async () => {
    const brunoTicket = sampleTicket({ number: "INC-20480", ownerId: "emp-bruno-tavares" });
    const { ticketGateway, queriedOwners } = createFakeTicketGateway([sampleTicket(), brunoTicket]);
    const { send } = await loggedInAsAna(await createTestContainer({ ticketGateway }));

    const stream = await (await send({ text: "Qual o status do meu chamado?" })).text();

    expect(stream).toContain("list_my_tickets");
    expect(stream).toContain("INC-20311");
    expect(stream).not.toContain("INC-20480");
    expect(queriedOwners).toEqual(["emp-ana-souza"]);
  });

  it("ADR-0010: o teto por minuto vale para todos juntos (protege a cota do modelo)", async () => {
    const container = await createContainer(testConfig({ CHAT_MESSAGES_PER_MINUTE: 1 }));
    const { app, login } = await createTestApp(container);
    const sendAs = async (email: string, text: string) =>
      app.request("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: await login(email) },
        body: JSON.stringify({ text }),
      });

    await (await sendAs(ANA_EMAIL, "oi")).text();
    const otherEmployee = await sendAs("bruno.tavares@nexo.com.br", "oi");

    expect(otherEmployee.status).toBe(429);
  });

  it("R06: um turno por vez; outra mensagem enquanto o agent responde recebe 'aguarde'", async () => {
    const container = await createContainer(testConfig());
    const ana = await container.authService.login({
      email: ANA_EMAIL,
      password: "x",
      remember: false,
    });

    const firstTurn = await container.chatService.sendMessage(ana.user, "primeira");
    await expect(container.chatService.sendMessage(ana.user, "segunda")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // Terminado o primeiro turno, a conversa fica livre de novo.
    const reader = firstTurn.getReader();
    while (!(await reader.read()).done) {
      // lê o stream até o fim: o turno termina
    }
    await expect(container.chatService.sendMessage(ana.user, "terceira")).resolves.toBeDefined();
  });

  it("A13: o limite por IP vale para todas as contas que saem dele", async () => {
    const container = await createContainer(testConfig());
    container.chatLimits.perIp = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      clock: systemClock,
    });
    const { app, login } = await createTestApp(container);
    const sendFrom = async (ip: string, email: string) =>
      app.request("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: await login(email),
          "X-Forwarded-For": ip,
        },
        body: JSON.stringify({ text: "oi" }),
      });

    await (await sendFrom("203.0.113.7", ANA_EMAIL)).text();
    const sameIp = await sendFrom("203.0.113.7", "bruno.tavares@nexo.com.br");
    const otherIp = await sendFrom("198.51.100.4", "carla.mendes@nexo.com.br");

    expect(sameIp.status).toBe(429);
    expect(otherIp.status).toBe(200);
  });

  it("RT10: cada turno registra os tokens do classificador e do agent", async () => {
    const container = await createContainer(testConfig());
    const { send } = await loggedInAsAna(container);

    await (await send({ text: "Qual o horário do service desk?" })).text();

    // O modelo de teste informa 120 tokens por chamada: 1 do classificador e 2 do agent (tool e resposta).
    const [trace] = await container.db.select().from(decisionTraces);
    expect(trace).toMatchObject({ classifierTokens: 120, agentTokens: 240 });
  });
});
