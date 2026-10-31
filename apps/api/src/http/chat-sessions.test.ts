import { describe, expect, it } from "vitest";
import { SESSION_MESSAGE_LIMIT } from "../app/chat-session-service.ts";
import { createFakeTicketGateway, createTestApp, createTestContainer } from "../test-support.ts";
import { createRateLimiter } from "./rate-limiter.ts";

type SessionResponse = {
  agentMessages: number;
  limit: number;
  isAtLimit: boolean;
  previousSummary: string | null;
};
type ConversationResponse = {
  conversation: { mode: string } | null;
  session: SessionResponse | null;
  messages: unknown[];
};

const HOUR_MS = 60 * 60 * 1000;

/** App com relógio controlado e sem o limite por hora, que tem teste próprio. */
async function setup() {
  let now = new Date("2026-10-27T12:00:00Z");
  const clock = { now: () => now };
  const container = await createTestContainer({
    clock,
    ticketGateway: createFakeTicketGateway().ticketGateway,
  });
  container.chatLimits.perUser = createRateLimiter({ limit: 1000, windowMs: HOUR_MS, clock });
  const { app, login } = await createTestApp(container);
  const cookie = await login("ana.souza@nexo.com.br");

  const send = (text: string) =>
    app.request("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text }),
    });
  const say = async (text: string) => (await send(text)).text();
  const conversation = async () =>
    (await (
      await app.request("/api/chat", { headers: { Cookie: cookie } })
    ).json()) as ConversationResponse;
  const newSession = () =>
    app.request("/api/chat/sessions", { method: "POST", headers: { Cookie: cookie } });
  const advanceHours = (hours: number) => (now = new Date(now.getTime() + hours * HOUR_MS));

  return { send, say, conversation, newSession, advanceHours };
}

describe("sessões de atendimento (RF10, RN14)", () => {
  it("RF10: a tela recebe o contador da sessão", async () => {
    const { say, conversation } = await setup();

    await say("Qual o horário do service desk?");
    await say("E o ramal?");

    expect((await conversation()).session).toEqual({
      agentMessages: 2,
      limit: 30,
      isAtLimit: false,
      startedAt: expect.any(String) as string,
      previousSummary: null,
    });
  });

  it("RN14: a 31ª mensagem é recusada sem chamar o modelo", async () => {
    const { send, say, conversation } = await setup();
    for (let index = 0; index < SESSION_MESSAGE_LIMIT; index += 1) {
      await say(`Qual o horário do service desk? (${index})`);
    }
    const messagesAtLimit = (await conversation()).messages.length;

    const blocked = await send("Mais uma pergunta");

    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: { code: "SESSION_LIMIT" } });
    const saved = await conversation();
    expect(saved.session).toMatchObject({ agentMessages: 30, isAtLimit: true });
    expect(saved.messages).toHaveLength(messagesAtLimit);
  });

  it("R03: nova sessão zera o contador e abre com o resumo da anterior", async () => {
    const { say, newSession, conversation } = await setup();
    await say("Qual o horário do service desk?");
    await say("Quero abrir um chamado: o monitor pisca o tempo todo");

    const response = await newSession();

    expect(response.status).toBe(200);
    const saved = await conversation();
    expect(saved.session).toMatchObject({ agentMessages: 0, isAtLimit: false });
    expect(saved.session?.previousSummary).toContain("Qual o horário do service desk?");
    expect(saved.session?.previousSummary).toContain("o monitor pisca o tempo todo");
    // RF11: o histórico anterior continua na tela.
    expect(saved.messages.length).toBeGreaterThanOrEqual(4);
  });

  it("R03: o rascunho pendente continua valendo na sessão nova", async () => {
    const { say, newSession, advanceHours } = await setup();
    await say("Quero abrir um chamado: o monitor pisca o tempo todo");
    advanceHours(0.1);
    await newSession();
    advanceHours(0.1);

    // O histórico do agent na sessão nova já não tem a mensagem que mostrou o D-1.
    const stream = await say("Confirmo, pode criar");

    expect(stream).toContain("confirm_draft");
    expect(stream).toMatch(/chamado INC-\d{5} criado/);
  });

  it("A05: depois de 8 h sem atividade, a próxima mensagem abre uma sessão nova", async () => {
    const { say, advanceHours, conversation } = await setup();
    await say("Qual o horário do service desk?");
    advanceHours(9);

    await say("Voltei: e o ramal?");

    expect((await conversation()).session).toMatchObject({
      agentMessages: 1,
      previousSummary: expect.stringContaining("Qual o horário do service desk?") as string,
    });
  });
});

describe("sessão com um analista (R41, R42)", () => {
  it("R42: mensagens para o analista não contam no limite", async () => {
    const { say, conversation } = await setup();
    await say("Quero falar com um analista");

    await say("Ainda estou aguardando");
    await say("Alguém aí?");

    expect((await conversation()).session?.agentMessages).toBe(1);
  });

  it("R41: com a conversa com um analista, a sessão não expira por inatividade", async () => {
    const { say, advanceHours, conversation } = await setup();
    await say("Quero falar com um analista");
    advanceHours(9);

    await say("Ainda estou aguardando");

    expect((await conversation()).session).toMatchObject({
      agentMessages: 1,
      previousSummary: null,
    });
  });
});
