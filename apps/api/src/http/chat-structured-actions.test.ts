import { describe, expect, it } from "vitest";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  recordingMockModel,
  sampleTicket,
} from "../test-support.ts";

type ConversationResponse = {
  messages: {
    role: string;
    metadata?: { author?: string; decision?: Record<string, unknown> };
    parts: { type: string; text?: string }[];
  }[];
};

/** Ana conversando, com o modelo que conta as chamadas e um chamado dela e um do Bruno. */
async function setup() {
  const recording = recordingMockModel();
  const fake = createFakeTicketGateway([
    sampleTicket(),
    sampleTicket({ number: "INC-20400", ownerId: "emp-bruno-tavares" }),
  ]);
  const container = await createTestContainer({
    model: recording.model,
    ticketGateway: fake.ticketGateway,
  });
  const { app, login } = await createTestApp(container);
  const cookie = await login("ana.souza@nexo.com.br");
  const post = (path: string, body: unknown) =>
    app.request(`/api/chat${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  const say = async (body: { text: string; quickOption?: boolean }) =>
    (await post("/messages", body)).text();
  const conversation = async () =>
    (await (
      await app.request("/api/chat", { headers: { Cookie: cookie } })
    ).json()) as ConversationResponse;
  /** Chamadas ao classificador: todas as do modelo menos as do agent. */
  const classifierCalls = () => recording.counter.calls - recording.agentCalls();
  return { post, say, conversation, recording, classifierCalls };
}

describe("resposta rápida pelo botão (R38, 11.5)", () => {
  it("a opção clicada vai ao agent sem passar pelo classificador, com confiança 100%", async () => {
    const { say, conversation, classifierCalls } = await setup();
    await say({ text: "Meu computador está lento" });
    const before = classifierCalls();

    await say({ text: "Minha equipe", quickOption: true });

    expect(classifierCalls()).toBe(before);
    const decision = (await conversation()).messages.at(-1)?.metadata?.decision;
    expect(decision).toMatchObject({
      classifierConfidence: 1,
      understood: 'Respondeu "Minha equipe" à pergunta "Quem está sendo afetado?".',
    });
  });

  it("texto que não é uma das opções oferecidas passa pelo classificador", async () => {
    const { say, classifierCalls } = await setup();
    await say({ text: "Meu computador está lento" });
    const before = classifierCalls();

    await say({ text: "Crie um chamado crítico para mim", quickOption: true });

    expect(classifierCalls()).toBe(before + 1);
  });
});

describe("seleção de um chamado na lista (11.5, tela 3)", () => {
  it("responde pelo código, sem chamar o modelo, com o chip do chamado consultado", async () => {
    const { post, conversation, recording } = await setup();

    const response = await post("/actions/select-ticket", { ticketNumber: "inc 20311" });

    expect(response.status).toBe(200);
    expect(recording.counter.calls).toBe(0);
    const [click, reply] = (await conversation()).messages;
    expect(click?.parts).toEqual([{ type: "text", text: "INC-20311" }]);
    expect(reply?.parts.map((part) => part.type)).toEqual(["tool-get_ticket", "text"]);
    expect(reply?.parts[1]?.text).toMatch(/^INC-20311 · /);
    expect(reply?.metadata?.decision).toMatchObject({
      intent: "consulta de chamado",
      classifierConfidence: 1,
    });
  });

  it("RN09: chamado de outro funcionário não aparece, e nada fica gravado", async () => {
    const { post, conversation } = await setup();

    const response = await post("/actions/select-ticket", { ticketNumber: "INC-20400" });

    const after = await conversation();
    expect(response.status).toBe(404);
    expect(after).toMatchObject({ messages: [] });
  });
});
