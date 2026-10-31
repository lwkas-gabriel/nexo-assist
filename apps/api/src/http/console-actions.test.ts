import { describe, expect, it } from "vitest";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { CONVERSATION_BUSY_MESSAGE } from "../app/conversation-locks.ts";
import {
  createFakeTicketGateway,
  mockModelWithClassifier,
  createTestApp,
  createTestContainer,
  sampleTicket,
} from "../test-support.ts";

type ChatView = {
  conversation: { mode: string; analyst: { name: string } | null } | null;
  session: { previousSummary: string | null } | null;
  messages: { metadata?: { author?: string }; parts: { type: string; text?: string }[] }[];
  drafts: { number: number }[];
};

const textOf = (message: ChatView["messages"][number] | undefined) =>
  message?.parts.map((part) => part.text ?? "").join("") ?? "";

type SetupOptions = {
  /** Troca peças do sistema de chamados falso (para atrasar ou derrubar uma escrita). */
  gateway?: (fake: TicketGateway) => Partial<TicketGateway>;
  /** Roda quando o classificador é chamado: o meio de um turno do agent. */
  duringClassifier?: () => Promise<void>;
};

/** Ana com o INC-20311 transferido; Rafael e Juliana no console. */
async function setup(options: SetupOptions = {}) {
  let now = new Date("2026-10-31T12:00:00Z");
  const clock = { now: () => now };
  const fake = createFakeTicketGateway([sampleTicket()], clock);
  const ticketGateway = { ...fake.ticketGateway, ...options.gateway?.(fake.ticketGateway) };
  const hooks: { classifier?: () => Promise<void> } = {};
  const container = await createTestContainer({
    clock,
    ticketGateway,
    model: mockModelWithClassifier(() => hooks.classifier?.()),
  });
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
  const request = (method: string, path: string, cookie: string, body: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  if (options.duringClassifier) hooks.classifier = options.duringClassifier;
  return { action, chat, post, request, cookies, fake, container };
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

  it("R06: dois analistas assumindo ao mesmo tempo, um só consegue", async () => {
    const { action, cookies } = await setup();

    const responses = await Promise.all([
      action("assume", cookies.rafael),
      action("assume", cookies.juliana),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("tela velha: assumir uma conversa que já voltou ao assistente diz isso em português", async () => {
    const { action, cookies } = await setup();
    await action("release", cookies.juliana);

    const response = await action("assume", cookies.rafael);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: "Esta conversa já voltou ao assistente; atualize a tela." },
    });
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

  it("devolver sem assumir (11.3): o chamado sai de aguardando analista", async () => {
    const { action, chat, cookies, fake } = await setup();

    expect((await action("release", cookies.juliana)).status).toBe(200);

    expect((await chat()).conversation?.mode).toBe("agent");
    expect(fake.tickets[0]?.status).toBe("in_progress");
    expect(fake.tickets[0]?.updates.at(-1)?.message).toBe(
      "Conversa devolvida ao assistente por Juliana Costa.",
    );
  });

  it("assumida pelo Rafael, a Juliana não devolve", async () => {
    const { action, cookies } = await setup();
    await action("assume", cookies.rafael);

    expect((await action("release", cookies.juliana)).status).toBe(403);
  });

  it("R31: o sistema de chamados caído não desfaz o assumir; o chamado fica como estava", async () => {
    const { action, chat, cookies, fake } = await setup({
      gateway: () => ({ assumeTicket: () => Promise.reject(new Error("fora do ar")) }),
    });

    const response = await action("assume", cookies.rafael);

    expect(response.status).toBe(200);
    expect((await chat()).conversation?.mode).toBe("analyst");
    expect(fake.tickets[0]?.status).toBe("waiting_analyst");
  });

  it("A08: encerrar devolve ao agent com sessão nova e resumo; o chamado segue o próprio status", async () => {
    const { action, chat, cookies, fake } = await setup();
    await action("assume", cookies.rafael);
    await action("messages", cookies.rafael, { text: "Reiniciei seu perfil. Pode testar?" });

    const response = await action("close", cookies.rafael);

    expect(response.status).toBe(200);
    const view = await chat();
    expect(view.conversation?.mode).toBe("agent");
    expect(view.session).toMatchObject({ agentMessages: 0 });
    expect(view.session?.previousSummary).toContain("Atendimento encerrado por Rafael Lima.");
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

  it("RN08: o console não age no meio de um turno do agent", async () => {
    // O gancho roda quando o classificador é chamado: o agent está no meio do turno.
    const duringTurn: { armed: boolean; response?: Response } = { armed: false };
    const { post, action, chat, cookies } = await setup({
      duringClassifier: async () => {
        if (!duringTurn.armed || duringTurn.response) return;
        duringTurn.response = await action("assume", cookies.rafael);
      },
    });
    await action("release", cookies.juliana);
    duringTurn.armed = true;

    await (await post("/api/chat/messages", cookies.ana, { text: "Qual o horário?" })).text();

    // A trava responde antes da regra de estado: sem ela, viria "já voltou ao assistente".
    expect(duringTurn.response?.status).toBe(409);
    expect(await duringTurn.response?.json()).toMatchObject({
      error: { message: CONVERSATION_BUSY_MESSAGE },
    });
    expect((await chat()).messages.at(-1)?.metadata?.author).toBe("agent");
  });
});

describe("crítico confirmado pelo card enquanto o analista assume (R06, A04)", () => {
  it("o assumir espera a transferência terminar: o chamado não volta a aguardando analista", async () => {
    // A escrita da transferência no sistema de chamados demora (novas tentativas, R01).
    const gate: { transfer?: Promise<void> } = {};
    let openGate = () => undefined as void;
    const { action, post, request, chat, cookies, container, fake } = await setup({
      gateway: (original) => ({
        transferTicket: async (...args) => {
          if (gate.transfer) await gate.transfer;
          return original.transferTicket(...args);
        },
      }),
    });
    await action("release", cookies.juliana);
    await (
      await post("/api/chat/messages", cookies.ana, { text: "Quero abrir um chamado: a rede caiu" })
    ).text();
    const draftNumber = (await chat()).drafts.at(-1)?.number;
    // A empresa inteira parada: o chamado é crítico, e confirmar transfere sozinho (A04).
    await request("PATCH", `/api/chat/drafts/${String(draftNumber)}`, cookies.ana, {
      affected: "whole_company",
    });
    gate.transfer = new Promise<void>((resolve) => (openGate = resolve));

    const confirming = post(`/api/chat/drafts/${String(draftNumber)}/confirm`, cookies.ana);
    const open = await container.conversationStore.findOpenByEmployee("emp-ana-souza");
    while (
      (await container.conversationStore.findById(open?.id ?? ""))?.mode !== "waiting_analyst"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const duringTransfer = await action("assume", cookies.rafael);
    openGate();
    expect((await confirming).status).toBe(200);
    const afterTransfer = await action("assume", cookies.rafael);

    expect(duringTransfer.status).toBe(409);
    expect(afterTransfer.status).toBe(200);
    const critical = fake.tickets.find((ticket) => ticket.priority === "critical");
    expect(critical?.status).toBe("in_service");
  });
});
