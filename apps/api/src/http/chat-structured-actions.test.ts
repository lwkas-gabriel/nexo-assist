import { AppError } from "@nexo/shared/errors";
import { describe, expect, it } from "vitest";
import { MOCK_IMPACT_QUESTION } from "../agent/mock-model.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  recordingMockModel,
  sampleTicket,
} from "../test-support.ts";

type ConversationResponse = {
  conversation: { mode: string } | null;
  messages: {
    role: string;
    metadata?: { author?: string; decision?: Record<string, unknown> };
    parts: { type: string; text?: string }[];
  }[];
};

/**
 * Ana conversando, com o modelo que conta as chamadas e um chamado dela e um do Bruno.
 * `duringGetTicket` roda enquanto o sistema de chamados responde (para simular o que acontece
 * nesse meio-tempo, ou fazê-lo falhar).
 */
async function setup(duringGetTicket?: () => Promise<void>) {
  const recording = recordingMockModel();
  const fake = createFakeTicketGateway([
    sampleTicket(),
    sampleTicket({ number: "INC-20400", ownerId: "emp-bruno-tavares" }),
  ]);
  const ticketGateway: TicketGateway = {
    ...fake.ticketGateway,
    getTicket: async (ownerId, number) => {
      await duringGetTicket?.();
      return fake.ticketGateway.getTicket(ownerId, number);
    },
  };
  const container = await createTestContainer({ model: recording.model, ticketGateway });
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
  return { post, say, conversation, recording, classifierCalls, container, fake };
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
      understood: `Respondeu "Minha equipe" à pergunta "${MOCK_IMPACT_QUESTION.question}".`,
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
    expect(click?.parts).toEqual([
      { type: "text", text: "INC-20311 · Notebook lento após atualização do Windows" },
    ]);
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

  it("RN08: com a conversa num analista, o clique fica para ele e ninguém responde", async () => {
    const { post, conversation, recording } = await setup();
    await post("/handoff", {});

    await post("/actions/select-ticket", { ticketNumber: "INC-20311" });

    const { messages } = await conversation();
    expect(messages.at(-1)?.parts).toEqual([
      { type: "text", text: "INC-20311 · Notebook lento após atualização do Windows" },
    ]);
    expect(messages.some((message) => message.metadata?.author === "agent")).toBe(false);
    expect(recording.counter.calls).toBe(0);
  });

  it("RN08: transferida durante a busca (crítico confirmado pelo card), o agent não responde", async () => {
    let transfer: () => Promise<void> = () => Promise.resolve();
    const { post, conversation, container } = await setup(() => transfer());
    transfer = async () => {
      const open = await container.conversationStore.findOpenByEmployee("emp-ana-souza");
      if (!open) throw new Error("conversa de teste sem abrir");
      await container.conversationStore.changeMode(open, {
        mode: "waiting_analyst",
        assignedAnalystId: null,
        now: new Date(),
      });
    };

    await post("/actions/select-ticket", { ticketNumber: "INC-20311" });

    const view = await conversation();
    expect(view.conversation?.mode).toBe("waiting_analyst");
    expect(view.messages.map((message) => message.metadata?.author)).toEqual(["employee"]);
  });

  it("sistema de chamados fora do ar: erro claro, e nada fica gravado pela metade", async () => {
    const { post, conversation } = await setup(() =>
      Promise.reject(new AppError("TICKETS_UNAVAILABLE", "Sistema de chamados indisponível.")),
    );

    const response = await post("/actions/select-ticket", { ticketNumber: "INC-20311" });

    expect(response.status).toBe(503);
    expect(await conversation()).toMatchObject({ messages: [] });
  });

  it("número que não é de chamado é recusado antes de consultar o sistema", async () => {
    const { post } = await setup(() => Promise.reject(new Error("não devia consultar")));

    expect((await post("/actions/select-ticket", { ticketNumber: "xyz" })).status).toBe(400);
  });

  it("A13: cliques demais em pouco tempo são recusados, como os demais botões", async () => {
    const { post } = await setup();
    const statuses: number[] = [];
    for (let click = 0; click < 61; click += 1) {
      statuses.push((await post("/actions/select-ticket", { ticketNumber: "xyz" })).status);
    }

    expect(statuses.slice(0, 60).every((status) => status === 400)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("oferta de analista para um chamado vencido (tela 3, RN07)", () => {
  /** A oferta existe depois que o funcionário escolhe o chamado vencido da lista. */
  async function withOffer() {
    const context = await setup();
    await context.post("/actions/select-ticket", { ticketNumber: "INC-20311" });
    return context;
  }

  it("Não, obrigado é respondido pelo código, sem chamar o modelo", async () => {
    const { post, conversation, recording } = await withOffer();

    const response = await post("/actions/decline-offer", { ticketNumber: "INC-20311" });

    expect(response.status).toBe(200);
    expect(recording.counter.calls).toBe(0);
    const [decline, reply] = (await conversation()).messages.slice(-2);
    expect(decline?.parts).toEqual([{ type: "text", text: "Não, obrigado" }]);
    expect(reply?.parts[0]?.text).toMatch(/^Combinado\. O INC-20311 continua com a equipe de TI/);
    expect(reply?.metadata?.decision).toMatchObject({ confidenceSource: "button" });
  });

  it("sem oferta na resposta mais recente, ou para outro chamado, é recusado e nada é gravado", async () => {
    const { post, conversation } = await withOffer();
    const before = (await conversation()).messages.length;

    const otherTicket = await post("/actions/decline-offer", { ticketNumber: "INC-20400" });
    const unknownTicket = await post("/actions/decline-offer", { ticketNumber: "INC-99999" });

    expect(otherTicket.status).toBe(409);
    expect(unknownTicket.status).toBe(409);
    expect((await conversation()).messages).toHaveLength(before);
  });

  it("oferta antiga (o funcionário já escreveu depois) não vale mais", async () => {
    const { post, say } = await withOffer();
    await say({ text: "Meu computador está lento" });

    const response = await post("/actions/decline-offer", { ticketNumber: "INC-20311" });

    expect(response.status).toBe(409);
  });

  it("RN08: transferida antes do clique (crítico pelo card), o Não, obrigado fica para o analista", async () => {
    const { post, conversation, container } = await withOffer();
    const open = await container.conversationStore.findOpenByEmployee("emp-ana-souza");
    if (!open) throw new Error("conversa de teste sem abrir");
    await container.conversationStore.changeMode(open, {
      mode: "waiting_analyst",
      assignedAnalystId: null,
      now: new Date(),
    });

    await post("/actions/decline-offer", { ticketNumber: "INC-20311" });

    const { messages } = await conversation();
    expect(messages.at(-1)?.parts).toEqual([{ type: "text", text: "Não, obrigado" }]);
    expect(messages.at(-1)?.metadata?.author).toBe("employee");
  });

  it("Falar com um analista com o chamado vencido transfere pelo prazo, ligado ao chamado", async () => {
    const { post, fake } = await setup();

    const response = await post("/handoff", { ticketNumber: "inc 20311" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      handoff: { reason: "chamado com prazo vencido", ticketNumber: "INC-20311" },
    });
    const ticket = fake.tickets.find((candidate) => candidate.number === "INC-20311");
    expect(ticket?.updates.at(-1)?.message).toMatch(
      /INC-20311, sem atualização da TI dentro do prazo/,
    );
  });

  it("chamado dentro do prazo: o resumo não afirma vencimento", async () => {
    const { post, fake } = await setup();
    const ticket = fake.tickets.find((candidate) => candidate.number === "INC-20311");
    if (!ticket) throw new Error("chamado de teste ausente");
    ticket.lastStaffUpdateAt = new Date().toISOString();

    const response = await post("/handoff", { ticketNumber: "INC-20311" });

    expect(await response.json()).toMatchObject({
      handoff: { reason: "o funcionário pediu um analista" },
    });
    expect(ticket.updates.at(-1)?.message).not.toMatch(/prazo/);
  });

  it("RN09: chamado de outra pessoa não é aceito, e ninguém é transferido", async () => {
    const { post, conversation } = await setup();

    const response = await post("/handoff", { ticketNumber: "INC-20400" });

    expect(response.status).toBe(404);
    expect((await conversation()).conversation?.mode ?? "agent").toBe("agent");
  });

  it("número que não é texto é recusado na entrada", async () => {
    const { post } = await setup();

    expect((await post("/handoff", { ticketNumber: 123 })).status).toBe(400);
  });

  it("sem corpo, o Falar com um analista continua sendo o pedido do funcionário", async () => {
    const { container } = await setup();
    const { app, login } = await createTestApp(container);
    const cookie = await login("ana.souza@nexo.com.br");

    const response = await app.request("/api/chat/handoff", {
      method: "POST",
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      handoff: { reason: "o funcionário pediu um analista" },
    });
  });
});
