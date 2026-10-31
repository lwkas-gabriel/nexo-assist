import { describe, expect, it } from "vitest";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  sampleTicket,
} from "../test-support.ts";

type ChatView = {
  conversation: { mode: string; analyst: { name: string } | null } | null;
  session: { previousSummary: string | null } | null;
  messages: { metadata?: { author?: string }; parts: { type: string; text?: string }[] }[];
};

const textOf = (message: ChatView["messages"][number] | undefined) =>
  message?.parts.map((part) => part.text ?? "").join("") ?? "";

/** Ana com o INC-20311 transferido; Rafael e Juliana no console. */
async function setup() {
  let now = new Date("2026-10-31T12:00:00Z");
  const clock = { now: () => now };
  const fake = createFakeTicketGateway([sampleTicket()]);
  const container = await createTestContainer({ clock, ticketGateway: fake.ticketGateway });
  const { app, login } = await createTestApp(container);
  const cookies = {
    ana: await login("ana.souza@nexo.com.br"),
    rafael: await login("rafael.lima@nexo.com.br"),
    juliana: await login("juliana.costa@nexo.com.br"),
  };
  const post = (path: string, cookie: string, body: unknown = {}) => {
    now = new Date(now.getTime() + 1000);
    return app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  };
  const chat = async () =>
    (await (
      await app.request("/api/chat", { headers: { Cookie: cookies.ana } })
    ).json()) as ChatView;
  await (await post("/api/chat/messages", cookies.ana, { text: "Oi" })).text();
  await post("/api/chat/handoff", cookies.ana, { ticketNumber: "INC-20311" });
  const open = await container.conversationStore.findOpenByEmployee("emp-ana-souza");
  if (!open) throw new Error("conversa de teste sem abrir");
  const action = (name: string, cookie: string, body?: unknown) =>
    post(`/api/console/conversations/${open.id}/${name}`, cookie, body);
  return { action, chat, post, cookies, fake };
}

describe("tela 5: assumir, responder, devolver e encerrar (RF20)", () => {
  it("assumir: o agent pausa, o funcionário vê quem atende e o chamado fica em atendimento", async () => {
    const { action, chat, cookies, fake } = await setup();

    const response = await action("assume", cookies.rafael);

    expect(response.status).toBe(200);
    const view = await chat();
    expect(view.conversation).toMatchObject({ mode: "analyst", analyst: { name: "Rafael Lima" } });
    expect(textOf(view.messages.at(-1))).toBe("Rafael Lima (Suporte N2) assumiu o atendimento.");
    expect(fake.tickets[0]?.status).toBe("in_service");
  });

  it("R06: dois analistas assumindo, um só consegue", async () => {
    const { action, cookies } = await setup();

    await action("assume", cookies.rafael);
    const second = await action("assume", cookies.juliana);

    expect(second.status).toBe(409);
  });

  it("responder: só quem assumiu, e a mensagem chega ao funcionário com nome e setor", async () => {
    const { action, chat, cookies } = await setup();
    expect((await action("messages", cookies.rafael, { text: "Oi" })).status).toBe(409);
    await action("assume", cookies.rafael);

    const other = await action("messages", cookies.juliana, { text: "Oi, Ana" });
    const reply = await action("messages", cookies.rafael, { text: "Oi, Ana. Já estou vendo." });

    expect(other.status).toBe(403);
    expect(reply.status).toBe(200);
    const last = (await chat()).messages.at(-1);
    expect(last?.metadata).toMatchObject({ author: "analyst" });
    expect(textOf(last)).toBe("Oi, Ana. Já estou vendo.");
  });

  it("R18: devolver ao agent: ele não fala agora, só na próxima mensagem do funcionário", async () => {
    const { action, chat, post, cookies } = await setup();
    await action("assume", cookies.rafael);

    await action("release", cookies.rafael);

    const afterRelease = await chat();
    expect(afterRelease.conversation?.mode).toBe("agent");
    expect(afterRelease.messages.at(-1)?.metadata?.author).toBe("system");
    await (
      await post("/api/chat/messages", cookies.ana, { text: "Qual o horário do service desk?" })
    ).text();
    expect((await chat()).messages.at(-1)?.metadata?.author).toBe("agent");
  });

  it("A08: encerrar devolve ao agent com sessão nova e resumo; o chamado segue o próprio status", async () => {
    const { action, chat, cookies, fake } = await setup();
    await action("assume", cookies.rafael);
    await action("messages", cookies.rafael, { text: "Reiniciei seu perfil. Pode testar?" });

    const response = await action("close", cookies.rafael);

    expect(response.status).toBe(200);
    const view = await chat();
    expect(view.conversation?.mode).toBe("agent");
    expect(view.session?.previousSummary).toBeTruthy();
    expect(
      view.messages.some((message) => textOf(message) === "Atendimento encerrado por Rafael Lima."),
    ).toBe(true);
    expect(fake.tickets[0]?.status).toBe("in_service");
  });

  it("encerrar só um atendimento assumido, e só por quem assumiu", async () => {
    const { action, cookies } = await setup();
    expect((await action("close", cookies.rafael)).status).toBe(409);
    await action("assume", cookies.rafael);

    expect((await action("close", cookies.juliana)).status).toBe(403);
  });

  it("funcionário não assume, não responde nem encerra pelo console", async () => {
    const { action, cookies } = await setup();

    const responses = await Promise.all([
      action("assume", cookies.ana),
      action("messages", cookies.ana, { text: "Oi" }),
      action("close", cookies.ana),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
  });
});
