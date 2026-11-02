import { describe, expect, it } from "vitest";
import {
  createFakeTicketGateway,
  createTestApp,
  createTestContainer,
  sampleTicket,
} from "../test-support.ts";

const ANA = "ana.souza@nexo.com.br";
const BRUNO = "bruno.tavares@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";

type ListResponse = {
  counts: Record<string, number>;
  conversations: {
    id: string;
    employee: { name: string; isOnline: boolean };
    state: { kind: string; ticketNumber?: string | null; byMe?: boolean };
    lastMessage: { author: string; text: string; seenByEmployee: boolean | null } | null;
    unread: number;
  }[];
};

/** Relógio controlado: "online" e não lidas dependem do tempo. */
async function setup() {
  let now = new Date("2026-10-31T12:00:00Z");
  const clock = { now: () => now };
  const fake = createFakeTicketGateway([
    sampleTicket(),
    sampleTicket({
      number: "INC-20298",
      title: "Acesso à pasta Financeiro",
      status: "in_progress",
    }),
    sampleTicket({ number: "INC-20480", ownerId: "emp-bruno-tavares" }),
  ]);
  const container = await createTestContainer({ clock, ticketGateway: fake.ticketGateway });
  const { app, login } = await createTestApp(container);
  const cookies = { ana: await login(ANA), bruno: await login(BRUNO), rafael: await login(RAFAEL) };
  const request = (path: string, cookie: string, body?: unknown) =>
    app.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const say = async (cookie: string, text: string) =>
    (await request("/api/chat/messages", cookie, { text })).text();
  const list = async (query = "") =>
    (await (
      await request(`/api/console/conversations${query}`, cookies.rafael)
    ).json()) as ListResponse;
  const advance = (ms: number) => (now = new Date(now.getTime() + ms));
  /** A conversa da pessoa, assumida direto no banco (o "Assumir" do console é da T24). */
  const assume = async (employeeId: string, analystId: string) => {
    const open = await container.conversationStore.findOpenByEmployee(employeeId);
    if (!open) throw new Error("conversa de teste sem abrir");
    await container.conversationStore.changeMode(open, {
      mode: "analyst",
      assignedAnalystId: analystId,
      now: clock.now(),
    });
  };
  return { request, say, list, advance, cookies, assume };
}

describe("console do analista, lista (RF18, tela 4)", () => {
  it("filtros com contagem: transferida é 'Para você'; com o agent, 'Com o agent'", async () => {
    const { say, list, cookies } = await setup();
    await say(cookies.ana, "Quero falar com um analista");
    await say(cookies.bruno, "Qual o horário do service desk?");

    const all = await list();
    const forYou = await list("?filter=for_you");

    expect(all.counts).toEqual({ all: 2, for_you: 1, with_agent: 1, mine: 0 });
    expect(forYou.conversations.map((item) => item.employee.name)).toEqual(["Ana Souza"]);
    expect(forYou.conversations[0]?.state).toMatchObject({ kind: "waiting" });
  });

  it("busca por nome sem acento e por número de chamado ligado à conversa", async () => {
    const { request, say, list, cookies } = await setup();
    await say(cookies.ana, "Oi");
    await request("/api/chat/handoff", cookies.ana, { ticketNumber: "INC-20311" });
    await say(cookies.bruno, "Oi");

    expect((await list("?q=BRUNO")).conversations.map((item) => item.employee.name)).toEqual([
      "Bruno Tavares",
    ]);
    expect((await list("?q=inc-20311")).conversations.map((item) => item.employee.name)).toEqual([
      "Ana Souza",
    ]);
  });

  it("A20: online no último minuto; não lidas até o analista abrir a conversa", async () => {
    const { request, say, list, advance, cookies } = await setup();
    await say(cookies.ana, "Quero falar com um analista");
    advance(1000);
    await say(cookies.ana, "Estou esperando");
    await request("/api/chat", cookies.ana);

    const [before] = (await list()).conversations;
    // Só a mensagem depois da transferência: antes dela, quem respondia era o agent.
    expect(before).toMatchObject({ employee: { isOnline: true }, unread: 1 });

    await request(`/api/console/conversations/${before?.id ?? ""}`, cookies.rafael);
    advance(61_000);
    const [after] = (await list()).conversations;
    expect(after).toMatchObject({ employee: { isOnline: false }, unread: 0 });
  });
});

describe("console do analista, conversa e chamados (RF19, RF21, R28)", () => {
  it("a conversa traz o resumo da transferência e o registro de decisão das respostas", async () => {
    const { request, say, list, cookies } = await setup();
    await say(cookies.ana, "Quero falar com um analista");
    const [item] = (await list()).conversations;

    const detail = (await (
      await request(`/api/console/conversations/${item?.id ?? ""}`, cookies.rafael)
    ).json()) as {
      conversation: { handoff: { reason: string; supportLevel: string } | null };
      messages: { metadata?: { author?: string; decision?: unknown; seenByEmployee?: boolean } }[];
    };

    expect(detail.conversation.handoff).toMatchObject({
      reason: "o funcionário pediu um analista",
      supportLevel: "N1",
    });
    const agentReply = detail.messages.find((message) => message.metadata?.author === "agent");
    expect(agentReply?.metadata?.decision).toBeDefined();
    // A20: a Ana ainda não carregou a conversa depois da resposta: entregue (✓), não vista.
    expect(agentReply?.metadata?.seenByEmployee).toBe(false);
    const system = detail.messages.find((message) => message.metadata?.author === "system");
    expect(system?.metadata?.seenByEmployee).toBeUndefined();
  });

  it("RF21: os chamados ligados à conversa vêm primeiro; só os do funcionário (RN09, A15)", async () => {
    const { request, say, list, cookies } = await setup();
    await say(cookies.ana, "Oi");
    await request("/api/chat/handoff", cookies.ana, { ticketNumber: "INC-20311" });
    const [item] = (await list()).conversations;

    const tickets = (await (
      await request(`/api/console/conversations/${item?.id ?? ""}/tickets`, cookies.rafael)
    ).json()) as {
      thisConversation: { number: string }[];
      others: { number: string }[];
      openCount: number;
    };

    expect(tickets.thisConversation.map((ticket) => ticket.number)).toEqual(["INC-20311"]);
    expect(tickets.others.map((ticket) => ticket.number)).toEqual(["INC-20298"]);
    expect(tickets.openCount).toBe(2);
  });

  it("funcionário não abre conversa nem chamados pelo console", async () => {
    const { request, say, list, cookies } = await setup();
    await say(cookies.ana, "Oi");
    const [item] = (await list()).conversations;

    const responses = await Promise.all([
      request(`/api/console/conversations/${item?.id ?? ""}`, cookies.bruno),
      request(`/api/console/conversations/${item?.id ?? ""}/tickets`, cookies.bruno),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403]);
  });

  it("conversa inexistente: 404", async () => {
    const { request, cookies } = await setup();

    const response = await request("/api/console/conversations/nao-existe", cookies.rafael);

    expect(response.status).toBe(404);
  });
});

describe("console do analista, estados da lista (tela 4)", () => {
  it("conversa só com o agent não tem não lidas: ninguém precisa ler", async () => {
    const { say, list, cookies } = await setup();
    await say(cookies.bruno, "Qual o horário do service desk?");
    await say(cookies.bruno, "E no sábado?");

    const [item] = (await list()).conversations;

    expect(item).toMatchObject({ state: { kind: "agent" }, unread: 0 });
  });

  it("A20: ✓✓ depois que o funcionário carrega a conversa", async () => {
    const { request, say, list, cookies } = await setup();
    await say(cookies.bruno, "Qual o horário do service desk?");
    expect((await list()).conversations[0]?.lastMessage?.seenByEmployee).toBe(false);

    await request("/api/chat", cookies.bruno);

    expect((await list()).conversations[0]?.lastMessage?.seenByEmployee).toBe(true);
  });

  it("R39: transferida por confiança baixa mostra a confiança do classificador", async () => {
    const { say, list, cookies } = await setup();
    await say(cookies.ana, "Tá dando alguma coisa estranha, não sei explicar");
    await say(cookies.ana, "Tá dando alguma coisa estranha, não sei explicar");

    const [item] = (await list("?filter=for_you")).conversations;

    expect(item?.state).toMatchObject({ kind: "waiting", confidence: 0.3 });
  });

  it("Minhas: só as conversas assumidas por quem está logado", async () => {
    const { say, list, cookies, assume } = await setup();
    await say(cookies.ana, "Quero falar com um analista");
    await say(cookies.bruno, "Quero falar com um analista");
    await assume("emp-ana-souza", "ana-rafael-lima");
    await assume("emp-bruno-tavares", "ana-juliana-costa");

    const mine = await list("?filter=mine");

    expect(mine.counts.mine).toBe(1);
    expect(mine.conversations.map((item) => [item.employee.name, item.state])).toEqual([
      [
        "Ana Souza",
        { kind: "analyst", byMe: true, analyst: { name: "Rafael Lima", department: "Suporte N2" } },
      ],
    ]);
  });

  it("busca também pelo setor", async () => {
    const { say, list, cookies } = await setup();
    await say(cookies.ana, "Oi");
    await say(cookies.bruno, "Oi");

    expect((await list("?q=financeiro")).conversations.map((item) => item.employee.name)).toEqual([
      "Ana Souza",
    ]);
  });
});
