import { describe, expect, it } from "vitest";
import { createFakeTicketGateway, createTestApp, createTestContainer } from "../test-support.ts";

type ConversationResponse = {
  conversation: { mode: string } | null;
  messages: {
    role: string;
    metadata?: { author?: string; decision?: Record<string, unknown> };
    parts: { text?: string }[];
  }[];
};

async function setup() {
  const fake = createFakeTicketGateway();
  const { app, login } = await createTestApp(
    await createTestContainer({ ticketGateway: fake.ticketGateway }),
  );
  const cookie = await login("ana.souza@nexo.com.br");
  const say = async (text: string) =>
    (
      await app.request("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ text }),
      })
    ).text();
  const conversation = async () =>
    (await (
      await app.request("/api/chat", { headers: { Cookie: cookie } })
    ).json()) as ConversationResponse;
  const agentDecisions = async () =>
    (await conversation()).messages
      .filter((message) => message.metadata?.author === "agent")
      .map((message) => message.metadata?.decision);
  return { say, conversation, agentDecisions };
}

describe("registro de decisão por turno (RF05, R05)", () => {
  it("RF05: cada resposta do agent tem o que foi entendido, o que foi feito e a confiança", async () => {
    const { say, agentDecisions } = await setup();

    await say("Qual o horário do service desk?");

    expect(await agentDecisions()).toEqual([
      expect.objectContaining({
        intent: "dúvida de TI",
        understood: "Qual o horário do service desk?",
        classifierConfidence: 0.8,
        steps: [expect.objectContaining({ tool: "search_knowledge_base", ok: true })],
      }),
    ]);
  });

  it("R09: a confiança final cai com os sinais do turno, e o motivo fica registrado", async () => {
    const { say, agentDecisions } = await setup();

    // Nenhum artigo da central de ajuda fala disso.
    await say("Como calibro o teletransportador quântico?");

    expect(await agentDecisions()).toEqual([
      expect.objectContaining({
        classifierConfidence: 0.8,
        finalConfidence: 0.6,
        signals: [expect.objectContaining({ code: "kb_without_answer" })],
      }),
    ]);
  });
});

describe("limiar de confiança (R39)", () => {
  it("R39: confiança baixa uma vez não transfere (o agent pergunta antes)", async () => {
    const { say, conversation } = await setup();

    await say("Tá dando alguma coisa estranha, não sei explicar");

    expect((await conversation()).conversation?.mode).toBe("agent");
  });

  it("R39: confiança baixa de novo no turno seguinte transfere para um analista", async () => {
    const { say, conversation } = await setup();
    await say("Tá dando alguma coisa estranha, não sei explicar");

    const stream = await say("Sei lá, continua estranho");

    // O agent nem foi chamado: o funcionário recebe só o aviso da transferência.
    expect(stream).not.toContain("tool-");
    expect(stream).toContain("o agent não teve segurança para resolver");
    const saved = await conversation();
    expect(saved.conversation?.mode).toBe("waiting_analyst");
    expect(saved.messages.at(-1)?.metadata).toMatchObject({
      author: "system",
      decision: {
        isLowConfidence: true,
        steps: [{ tool: "handoff_to_analyst", outcome: "transferência feita pelo código" }],
        rules: expect.arrayContaining([
          "R39: confiança baixa em duas mensagens seguidas → analista",
        ]) as string[],
      },
    });
  });

  it("uma resposta com confiança boa no meio zera a sequência", async () => {
    const { say, conversation } = await setup();
    await say("Tá dando alguma coisa estranha, não sei explicar");
    await say("Qual o horário do service desk?");

    await say("Sei lá, continua estranho");

    expect((await conversation()).conversation?.mode).toBe("agent");
  });
});
