import { describe, expect, it } from "vitest";
import { createContainer } from "../container.ts";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  testConfig,
} from "../test-support.ts";

const ANA_EMAIL = "ana.souza@nexo.com.br";

type ConversationResponse = {
  conversation: { id: string; mode: string } | null;
  messages: { role: string; metadata?: { author?: string }; parts: { text?: string }[] }[];
};

async function setup() {
  const fake = createFakeTicketGateway();
  const { app, login } = await createTestApp(
    await createTestContainer({ ticketGateway: fake.ticketGateway }),
  );
  const ana = await login(ANA_EMAIL);
  const request = (method: string, path: string, body?: unknown) =>
    app.request(`/api/chat${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: ana },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const say = async (text: string) => (await request("POST", "/messages", { text })).text();
  const conversation = async () =>
    (await (await request("GET", "")).json()) as ConversationResponse;

  return { fake, request, say, conversation };
}

describe("transferência pelo chat (RF16, RF17)", () => {
  it("RF16: pedir um analista transfere a conversa e registra a transferência", async () => {
    const { say, conversation } = await setup();

    const stream = await say("Quero falar com um analista, por favor");

    expect(stream).toContain("handoff_to_analyst");
    expect(stream).toContain("Suporte N1");
    const saved = await conversation();
    expect(saved.conversation?.mode).toBe("waiting_analyst");
    expect(saved.messages.find((message) => message.metadata?.author === "system")).toMatchObject({
      parts: [
        { text: expect.stringContaining("Conversa transferida para o Suporte N1") as string },
      ],
    });
  });

  it("RN08: com a conversa transferida, o agent não responde e a mensagem fica para o analista", async () => {
    const { say, conversation } = await setup();
    await say("Quero falar com um analista");
    const before = (await conversation()).messages.length;

    const stream = await say("Só para avisar: o erro voltou agora há pouco");

    expect(stream).not.toContain("tool-");
    expect(stream).not.toContain("text-delta");
    const after = await conversation();
    expect(after.messages).toHaveLength(before + 1);
    expect(after.messages.at(-1)).toMatchObject({
      role: "user",
      parts: [{ text: "Só para avisar: o erro voltou agora há pouco" }],
    });
  });

  it("A04: confirmar um chamado crítico pelo botão transfere direto para o N2", async () => {
    const { say, request, conversation } = await setup();
    await say("Quero abrir um chamado: o sistema de vendas caiu para toda a equipe");
    await request("PATCH", "/drafts/D-1", { affected: "my_team" });

    const response = await request("POST", "/drafts/D-1/confirm");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ticket: { priority: "critical" },
      handoff: { supportLevel: "N2", reason: "caso crítico" },
    });
    expect((await conversation()).conversation?.mode).toBe("waiting_analyst");
  });

  it("R42: mensagens para o analista não gastam a cota do modelo", async () => {
    // Teto global de 1 mensagem por dia: a primeira, ao agent, já o esgota.
    const container = await createContainer(testConfig({ CHAT_MESSAGES_PER_DAY: 1 }));
    const { app, login } = await createTestApp(container);
    const ana = await login(ANA_EMAIL);
    const say = (text: string) =>
      app.request("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ana },
        body: JSON.stringify({ text }),
      });

    await (await say("Quero falar com um analista")).text();
    const toAnalyst = await say("Ainda estou aguardando");

    expect(toAnalyst.status).toBe(200);
  });
});
