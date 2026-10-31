import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "../../test-setup.ts";
import type { CurrentUser } from "../auth/auth-api.ts";
import { sampleDecision } from "../chat/decision.fixture.ts";
import { onTimeTicket, overdueTicket } from "../chat/ticket.fixture.ts";
import type { ConsoleConversation, ConsoleList, ConsoleTickets } from "./console-api.ts";
import { ConsolePage } from "./ConsolePage.tsx";

const RAFAEL: CurrentUser = {
  id: "ana-rafael-lima",
  name: "Rafael Lima",
  email: "rafael.lima@nexo.com.br",
  role: "analyst",
  department: "Suporte N2",
};

const LIST: ConsoleList = {
  counts: { all: 2, for_you: 1, with_agent: 1, mine: 0 },
  conversations: [
    {
      id: "c-ana",
      employee: { name: "Ana Souza", department: "Financeiro", isOnline: true },
      state: {
        kind: "waiting",
        reason: "chamado com prazo vencido",
        ticketNumber: "INC-20311",
        responseDueAt: "2026-10-31T15:05:00Z",
        confidence: null,
      },
      updatedAt: "2026-10-31T13:05:00Z",
      lastMessage: {
        author: "employee",
        text: "Quero falar com um analista.",
        createdAt: "2026-10-31T13:04:00Z",
        seenByEmployee: null,
      },
      unread: 2,
    },
    {
      id: "c-bruno",
      employee: { name: "Bruno Tavares", department: "Comercial", isOnline: false },
      state: { kind: "agent" },
      updatedAt: "2026-10-31T12:51:00Z",
      lastMessage: {
        author: "agent",
        text: "O chamado INC-20480 está em andamento.",
        createdAt: "2026-10-31T12:51:00Z",
        seenByEmployee: true,
      },
      unread: 0,
    },
  ],
};

const CONVERSATION: ConsoleConversation = {
  conversation: {
    id: "c-ana",
    mode: "waiting_analyst",
    version: 2,
    employee: { name: "Ana Souza", department: "Financeiro", isOnline: true },
    state: LIST.conversations[0]?.state ?? { kind: "agent" },
    handoff: {
      reason: "chamado com prazo vencido",
      supportLevel: "N2",
      problem: "Notebook lento há 6 dias, sem resposta da TI.",
      attempted: "Reiniciou e rodou o diagnóstico.",
      ticketNumber: "INC-20311",
      responseDueAt: "2026-10-31T15:05:00Z",
    },
  },
  messages: [
    {
      id: "m-1",
      role: "user",
      metadata: { author: "employee", createdAt: "2026-10-31T13:01:00Z" },
      parts: [{ type: "text", text: "Qual o status do meu chamado?" }],
    },
    {
      id: "m-2",
      role: "assistant",
      metadata: {
        author: "agent",
        createdAt: "2026-10-31T13:01:10Z",
        decision: sampleDecision,
        seenByEmployee: true,
      },
      parts: [{ type: "text", text: "Você tem 3 chamados abertos." }],
    },
  ],
};

const TICKETS: ConsoleTickets = {
  employeeName: "Ana Souza",
  openCount: 2,
  closedCount: 0,
  thisConversation: [overdueTicket],
  others: [onTimeTicket],
};

function stubConsole() {
  const paths: string[] = [];
  vi.stubGlobal("fetch", (input: string) => {
    paths.push(input);
    const body = input.startsWith("/api/console/conversations?")
      ? LIST
      : input.endsWith("/tickets")
        ? TICKETS
        : CONVERSATION;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  return paths;
}

function renderConsole() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConsolePage user={RAFAEL} isLoggingOut={false} onLogout={() => undefined} />
    </QueryClientProvider>,
  );
}

describe("console do analista (tela 4)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("RF18: lista com filtros e contagem, etiqueta e não lidas", async () => {
    stubConsole();
    renderConsole();

    const list = await screen.findByRole("list", { name: "Conversas" });
    expect(within(list).getByText("Transferida · INC-20311")).toBeDefined();
    expect(within(list).getByText("Agent atendendo")).toBeDefined();
    expect(within(list).getByText("2")).toBeDefined();
    expect(screen.getByRole("radio", { name: "Para você, 1 conversa" })).toBeDefined();
  });

  it("filtro e busca vão para a api", async () => {
    const paths = stubConsole();
    renderConsole();
    await screen.findByRole("list", { name: "Conversas" });

    await userEvent.click(screen.getByRole("radio", { name: /Para você/ }));
    await userEvent.type(screen.getByLabelText("Pesquisar conversa ou chamado"), "ana");

    expect(paths).toContain("/api/console/conversations?filter=for_you&q=ana");
  });

  it("RF19, RF21: abrir a conversa mostra o resumo da transferência e os chamados ao lado", async () => {
    stubConsole();
    renderConsole();

    await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));

    expect(await screen.findByText("Notebook lento há 6 dias, sem resposta da TI.")).toBeDefined();
    const panel = await screen.findByRole("complementary", { name: "Chamados de Ana" });
    expect(within(panel).getByText("Desta conversa")).toBeDefined();
    expect(within(panel).getByText(overdueTicket.title)).toBeDefined();
  });

  it("R28: as respostas do agent têm o detalhe da decisão, no lugar dos chamados", async () => {
    stubConsole();
    renderConsole();
    await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));

    await userEvent.click(await screen.findByRole("button", { name: "detalhes da decisão" }));

    const panel = screen.getByRole("complementary", { name: "Detalhe da decisão" });
    expect(within(panel).getByText(sampleDecision.understood)).toBeDefined();
  });

  it("10.6: no celular, uma coluna por vez, com volta para a lista", async () => {
    setViewportWidth(390);
    stubConsole();
    renderConsole();

    await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));
    expect(screen.queryByRole("list", { name: "Conversas" })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Voltar para as conversas" }));

    expect(await screen.findByRole("list", { name: "Conversas" })).toBeDefined();
  });

  it("10.6: no notebook, os chamados ficam numa gaveta que só abre a pedido", async () => {
    setViewportWidth(1024);
    stubConsole();
    renderConsole();

    await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));
    await screen.findByText("Notebook lento há 6 dias, sem resposta da TI.");
    expect(screen.queryByRole("dialog", { name: "Chamados de Ana" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Chamados de Ana Souza" }));

    expect(await screen.findByRole("dialog", { name: "Chamados de Ana" })).toBeDefined();
  });

  it("as respostas do agent mostram o remetente uma vez, com a etiqueta IA", async () => {
    stubConsole();
    renderConsole();
    await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));

    const log = await screen.findByRole("log", { name: "Conversa com Ana Souza" });
    expect(within(log).getAllByText("Nexo Assist")).toHaveLength(1);
    expect(within(log).getByText("IA")).toBeDefined();
  });
});
