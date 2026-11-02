import { describe, expect, it } from "vitest";
import { createFakeTicketGateway, createTestApp, createTestContainer } from "../test-support.ts";

const clock = { now: () => new Date("2026-10-31T12:00:00Z") };

type ConversationResponse = {
  conversation: { mode: string; analyst: { name: string; department: string } | null } | null;
  messages: { metadata?: { author?: string; analyst?: unknown } }[];
};

const RAFAEL = "ana-rafael-lima";

/** Ana com a conversa já com o Rafael (o assumir do console é da T24; aqui, direto no banco). */
async function setup() {
  const container = await createTestContainer({
    clock,
    ticketGateway: createFakeTicketGateway().ticketGateway,
  });
  const { app, login } = await createTestApp(container);
  const cookie = await login("ana.souza@nexo.com.br");
  const conversation = async () =>
    (await (
      await app.request("/api/chat", { headers: { Cookie: cookie } })
    ).json()) as ConversationResponse;
  const assumeByRafael = async () => {
    const open = await container.conversationStore.create("emp-ana-souza", clock.now());
    const assumed = await container.conversationStore.changeMode(open, {
      mode: "analyst",
      assignedAnalystId: RAFAEL,
      now: clock.now(),
    });
    if (!assumed) throw new Error("conversa de teste não mudou de modo");
    await container.conversationStore.appendMessage({
      conversationId: open.id,
      author: "analyst",
      authorId: RAFAEL,
      parts: [{ type: "text", text: "Oi, Ana. Vou olhar seu notebook." }],
      createdAt: clock.now(),
    });
  };
  const startWithAgent = () => container.conversationStore.create("emp-ana-souza", clock.now());
  return { conversation, assumeByRafael, startWithAgent, container };
}

describe("conversa com um analista, do lado do funcionário (R27)", () => {
  it("diz quem atende, na conversa e nas bolhas do analista", async () => {
    const { conversation, assumeByRafael } = await setup();
    await assumeByRafael();

    const view = await conversation();

    // Só nome e setor: nem id, nem e-mail do analista vão para a tela do funcionário.
    const rafael = { name: "Rafael Lima", department: "Suporte N2" };
    expect(view.conversation?.analyst).toEqual(rafael);
    expect(view.messages.at(-1)?.metadata?.analyst).toEqual(rafael);
    expect(JSON.stringify(view)).not.toMatch(/ana-rafael-lima|rafael\.lima@/);
  });

  it("com o agent, ninguém atende", async () => {
    const { conversation, startWithAgent } = await setup();
    await startWithAgent();

    const view = await conversation();

    expect(view.conversation).toMatchObject({ mode: "agent", analyst: null });
  });

  it("devolvida ao agent, quem atendeu não aparece mais no topo", async () => {
    const { conversation, assumeByRafael, container } = await setup();
    await assumeByRafael();
    const open = await container.conversationStore.findOpenByEmployee("emp-ana-souza");
    if (!open) throw new Error("conversa de teste sem abrir");
    await container.conversationStore.changeMode(open, {
      mode: "agent",
      assignedAnalystId: RAFAEL,
      now: clock.now(),
    });

    const view = await conversation();

    expect(view.conversation).toMatchObject({ mode: "agent", analyst: null });
  });
});
