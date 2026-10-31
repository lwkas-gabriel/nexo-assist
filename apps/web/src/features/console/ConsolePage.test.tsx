import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "../../test-setup.ts";
import type { CurrentUser } from "../auth/auth-api.ts";
import { sampleDecision } from "../chat/decision.fixture.ts";
import { agentWithTool, onTimeTicket, overdueTicket } from "../chat/ticket.fixture.ts";
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
  drafts: [],
};

const TICKETS: ConsoleTickets = {
  employeeName: "Ana Souza",
  openCount: 2,
  closedCount: 0,
  thisConversation: [overdueTicket],
  others: [onTimeTicket],
};

function stubConsole(conversation: ConsoleConversation = CONVERSATION) {
  const paths: string[] = [];
  vi.stubGlobal("fetch", (input: string) => {
    paths.push(input);
    const body = input.startsWith("/api/console/conversations?")
      ? LIST
      : input.endsWith("/tickets")
        ? TICKETS
        : conversation;
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
    expect(
      within(list).getByText((_, element) => element?.textContent === "2 não lidas"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Para você, 1 conversa" })).toBeDefined();
  });

  it("filtro e busca vão para a api", async () => {
    const paths = stubConsole();
    renderConsole();
    await screen.findByRole("list", { name: "Conversas" });

    await userEvent.click(screen.getByRole("button", { name: /^Para você/ }));
    await userEvent.type(screen.getByLabelText("Pesquisar conversa ou chamado"), "ana");

    // Uma consulta só, depois que a pessoa parou de digitar (não uma por tecla).
    await waitFor(() => expect(paths).toContain("/api/console/conversations?filter=for_you&q=ana"));
    expect(paths).not.toContain("/api/console/conversations?filter=for_you&q=a");
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

  describe("foco e painel (10.7)", () => {
    it("escolher a conversa no desktop não tira o foco da lista", async () => {
      stubConsole();
      renderConsole();

      const item = await screen.findByRole("button", { name: /Ana Souza/ });
      await userEvent.click(item);
      await screen.findByRole("complementary", { name: "Chamados de Ana" });

      expect(document.activeElement).toBe(item);
    });

    it("fechar os chamados no desktop deixa um botão para reabrir", async () => {
      stubConsole();
      renderConsole();
      await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));

      await userEvent.click(await screen.findByRole("button", { name: "Fechar Chamados de Ana" }));
      await userEvent.click(screen.getByRole("button", { name: "Chamados de Ana Souza" }));

      expect(screen.getByRole("complementary", { name: "Chamados de Ana" })).toBeDefined();
    });

    it("fechar o detalhe da decisão devolve o foco ao botão que o abriu", async () => {
      stubConsole();
      renderConsole();
      await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));
      const details = await screen.findByRole("button", { name: "detalhes da decisão" });
      await userEvent.click(details);

      await userEvent.click(screen.getByRole("button", { name: "Fechar Detalhe da decisão" }));

      await waitFor(() => expect(document.activeElement).toBe(details));
      expect(screen.getByRole("complementary", { name: "Chamados de Ana" })).toBeDefined();
    });

    it("celular: abrir a conversa leva o foco ao título; voltar, ao item de onde veio", async () => {
      setViewportWidth(390);
      stubConsole();
      renderConsole();

      await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Ana Souza" })),
      );
      await userEvent.click(screen.getByRole("button", { name: "Voltar para as conversas" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("button", { name: /Ana Souza/ })),
      );
    });
  });

  it("RF19: o analista vê os cards que o funcionário viu, só como registro", async () => {
    stubConsole({
      ...CONVERSATION,
      messages: [
        agentWithTool("m-3", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
      ],
    });
    renderConsole();

    await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));

    const log = await screen.findByRole("log", { name: "Conversa com Ana Souza" });
    expect(within(log).getByRole("region", { name: "Chamado INC-20311" })).toBeDefined();
    expect(within(log).queryByRole("button", { name: "Não, obrigado" })).toBeNull();
  });

  describe("tela 5: assumir, responder, devolver e encerrar (RF20)", () => {
    /** A api do console que guarda os POSTs; `failing` responde 409 a uma ação. */
    function stubActions(
      initial: ConsoleConversation,
      failing?: string,
      /** A conversa como a api devolve depois de uma ação bem-sucedida. */
      afterAction?: ConsoleConversation,
    ) {
      let conversation = initial;
      const posts: { path: string; body: unknown }[] = [];
      vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push({
            path: input,
            body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null,
          });
          if (failing && input.endsWith(failing)) {
            const error = {
              error: { code: "CONFLICT", message: "Outro analista já assumiu esta conversa." },
            };
            return Promise.resolve(new Response(JSON.stringify(error), { status: 409 }));
          }
          if (afterAction) conversation = afterAction;
          return Promise.resolve(new Response("{}", { status: 200 }));
        }
        const body = input.startsWith("/api/console/conversations?")
          ? LIST
          : input.endsWith("/tickets")
            ? TICKETS
            : conversation;
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      });
      return posts;
    }
    const mine: ConsoleConversation = {
      ...CONVERSATION,
      conversation: {
        ...CONVERSATION.conversation,
        mode: "analyst",
        state: {
          kind: "analyst",
          byMe: true,
          analyst: { name: "Rafael Lima", department: "Suporte N2" },
        },
      },
    };
    const open = async () => {
      renderConsole();
      await userEvent.click(await screen.findByRole("button", { name: /Ana Souza/ }));
    };

    it("aguardando: assumir leva o foco ao campo de resposta (10.7)", async () => {
      const posts = stubActions(CONVERSATION, undefined, mine);
      await open();

      expect(await screen.findByText("Assuma o atendimento para responder")).toBeDefined();
      await userEvent.click(screen.getByRole("button", { name: "Assumir atendimento" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText("Resposta para Ana")),
      );
      expect(posts.map((post) => post.path)).toContain("/api/console/conversations/c-ana/assume");
    });

    it("aguardando: devolver ao agent sem assumir", async () => {
      const posts = stubActions(CONVERSATION);
      await open();

      await userEvent.click(await screen.findByRole("button", { name: "Devolver ao agent" }));

      await waitFor(() =>
        expect(posts.map((post) => post.path)).toContain(
          "/api/console/conversations/c-ana/release",
        ),
      );
    });

    it("encerrar leva o foco ao título da conversa (o botão some)", async () => {
      stubActions(mine, undefined, {
        ...mine,
        conversation: { ...mine.conversation, mode: "agent", state: { kind: "agent" } },
      });
      await open();

      await userEvent.click(await screen.findByRole("button", { name: "Encerrar atendimento" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Ana Souza" })),
      );
    });

    it("conflito ao assumir aparece na barra", async () => {
      stubActions(CONVERSATION, "/assume");
      await open();

      await userEvent.click(await screen.findByRole("button", { name: "Assumir atendimento" }));

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Outro analista já assumiu esta conversa.",
      );
    });

    it("assumida por mim: responder esvazia o campo; devolver e encerrar ficam no topo", async () => {
      const posts = stubActions(mine);
      await open();

      const field = await screen.findByLabelText("Resposta para Ana");
      await userEvent.type(field, "Oi, Ana. Já estou vendo.{Enter}");
      await waitFor(() => expect(field).toHaveProperty("value", ""));
      await userEvent.click(screen.getByRole("button", { name: "Encerrar atendimento" }));
      await userEvent.click(screen.getByRole("button", { name: "Devolver ao agent" }));

      await waitFor(() =>
        expect(posts).toEqual([
          {
            path: "/api/console/conversations/c-ana/messages",
            body: { text: "Oi, Ana. Já estou vendo." },
          },
          { path: "/api/console/conversations/c-ana/close", body: null },
          { path: "/api/console/conversations/c-ana/release", body: null },
        ]),
      );
    });

    it("com outro analista, o campo fica trancado e não há ações", async () => {
      stubActions({
        ...mine,
        conversation: {
          ...mine.conversation,
          state: {
            kind: "analyst",
            byMe: false,
            analyst: { name: "Juliana Costa", department: "Suporte N1" },
          },
        },
      });
      await open();

      expect(await screen.findByText("Juliana Costa está atendendo")).toBeDefined();
      expect(screen.queryByRole("button", { name: "Encerrar atendimento" })).toBeNull();
      expect(screen.queryByLabelText("Resposta para Ana")).toBeNull();
    });
  });
});
