import { describe, expect, it } from "vitest";
import type { Container } from "../container.ts";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  mockModelWithClassifier,
} from "../test-support.ts";

type ConversationResponse = {
  conversation: { id: string; mode: string } | null;
  messages: {
    role: string;
    metadata?: { author?: string; decision?: Record<string, unknown> };
    parts: { text?: string }[];
  }[];
};

async function setup(container?: Container) {
  const fake = createFakeTicketGateway();
  const { app, login } = await createTestApp(
    container ?? (await createTestContainer({ ticketGateway: fake.ticketGateway })),
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
  const patch = (path: string, body: unknown) =>
    app.request(`/api/chat${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  return { say, conversation, agentDecisions, patch };
}

const VAGUE = "Tá dando alguma coisa estranha, não sei explicar";

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

describe("limiar de confiança: casos de borda (revisão da T14)", () => {
  it("R39: depois de o analista devolver a conversa, a sequência recomeça", async () => {
    const container = await createTestContainer();
    const { say, conversation } = await setup(container);
    await say(VAGUE);
    await say(VAGUE);
    const transferred = await container.conversationStore.findById(
      (await conversation()).conversation?.id ?? "",
    );
    if (!transferred) throw new Error("Conversa não encontrada");
    // A devolução ao agent (a rota do console chega na T24) muda a versão da conversa.
    await container.conversationStore.changeMode(transferred, {
      mode: "agent",
      assignedAnalystId: null,
      now: new Date(),
    });

    await say(VAGUE);

    expect((await conversation()).conversation?.mode).toBe("agent");
  });

  it("um clique no card entre duas mensagens vagas zera a sequência (ação determinística)", async () => {
    const { say, patch, conversation, agentDecisions } = await setup();
    await say("Quero abrir um chamado: o monitor pisca o tempo todo");
    await say(VAGUE);
    await patch("/drafts/D-1", { affected: "my_team" });

    await say(VAGUE);

    expect((await conversation()).conversation?.mode).toBe("agent");
    expect(
      (await conversation()).messages.find((message) =>
        message.parts[0]?.text?.startsWith("Rascunho D-1 editado"),
      )?.metadata?.decision,
    ).toMatchObject({ classifierConfidence: 1, steps: [{ tool: "draft_button" }] });
    expect(await agentDecisions()).toHaveLength(3);
  });
});

describe("estado da conversa durante a classificação (RN08)", () => {
  it("RN08: transferida enquanto o classificador pensava, o agent não responde", async () => {
    // O modelo precisa do container, que só existe depois de criado com o modelo.
    const created: { container?: Container } = {};
    const transferDuringClassification = async () => {
      const store = created.container?.conversationStore;
      const open = await store?.findOpenByEmployee("emp-ana-souza");
      if (open) {
        await store?.changeMode(open, {
          mode: "waiting_analyst",
          assignedAnalystId: null,
          now: new Date(),
        });
      }
    };
    created.container = await createTestContainer({
      model: mockModelWithClassifier(transferDuringClassification),
    });
    const { say, conversation } = await setup(created.container);

    const stream = await say("Qual o horário do service desk?");

    expect(stream).not.toContain("text-delta");
    const saved = await conversation();
    expect(saved.conversation?.mode).toBe("waiting_analyst");
    expect(saved.messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("classificador fora do ar: o agent responde e o registro diz que faltou a etapa 1", async () => {
    const container = await createTestContainer({
      model: mockModelWithClassifier(() => {
        throw new Error("classificador fora do ar");
      }),
    });
    const { say, agentDecisions } = await setup(container);

    const stream = await say("Qual o horário do service desk?");

    expect(stream).toContain("search_knowledge_base");
    expect(await agentDecisions()).toEqual([
      expect.objectContaining({
        classifierConfidence: 0.5,
        signals: [expect.objectContaining({ code: "classifier_unavailable" })],
      }),
    ]);
  });
});
