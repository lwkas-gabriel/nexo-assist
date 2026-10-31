import type { ConversationMode } from "@nexo/shared/domain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "../../test-setup.ts";
import type { CurrentUser } from "../auth/auth-api.ts";
import type { ConversationView } from "./chat-api.ts";
import { ChatPage } from "./ChatPage.tsx";
import { sampleDecision } from "./decision.fixture.ts";
import { agentWithTool, onTimeTicket, overdueTicket } from "./ticket.fixture.ts";

const ANA: CurrentUser = {
  id: "emp-ana-souza",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  role: "employee",
  department: "Financeiro",
};

function conversationAt(mode: ConversationMode, isAtLimit: boolean): ConversationView {
  return {
    conversation: { id: "c-1", mode },
    session: {
      agentMessages: isAtLimit ? 30 : 12,
      limit: 30,
      isAtLimit,
      startedAt: "2026-10-31T12:00:00.000Z",
      previousSummary: null,
    },
    messages: [],
    drafts: [],
  };
}

const RATE_LIMITED = {
  error: { code: "RATE_LIMITED", message: "Muitas mensagens em pouco tempo." },
};

/**
 * A api por rota: `GET /chat` devolve a conversa da vez (muda depois do "Falar com um analista");
 * o envio de mensagem falha, para os testes do "Tentar novamente".
 */
function stubApi(initial: ConversationView, afterHandoff: ConversationView = initial) {
  const calls: string[] = [];
  const sentBodies: unknown[] = [];
  let current = initial;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    const call = `${init?.method ?? "GET"} ${input}`;
    calls.push(call);
    if (call === "POST /api/chat/handoff") current = afterHandoff;
    if (call === "POST /api/chat/messages") {
      sentBodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "null"));
      return Promise.resolve(new Response(JSON.stringify(RATE_LIMITED), { status: 429 }));
    }
    const body = call === "GET /api/chat" ? current : {};
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  return { calls, sentBodies };
}

function renderChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatPage user={ANA} isLoggingOut={false} onLogout={() => undefined} />
    </QueryClientProvider>,
  );
}

describe("tela do chat (tela 2)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("RN14: no limite, falar com um analista transfere e devolve o campo de mensagem", async () => {
    const { calls } = stubApi(
      conversationAt("agent", true),
      conversationAt("waiting_analyst", true),
    );
    renderChat();

    await userEvent.click(await screen.findByRole("button", { name: "Falar com um analista" }));

    expect(await screen.findByLabelText("Mensagem para o Nexo")).toBeDefined();
    expect(screen.queryByText(/Limite desta sessão atingido/)).toBeNull();
    expect(calls).toContain("POST /api/chat/handoff");
  });

  it("RN14: com a conversa no analista, o limite do agent não bloqueia o funcionário", async () => {
    stubApi(conversationAt("analyst", true));
    renderChat();

    expect(await screen.findByLabelText("Mensagem para o Nexo")).toBeDefined();
    expect(screen.queryByText(/Limite desta sessão atingido/)).toBeNull();
  });

  it("a página tem título e a conversa é uma região viva", async () => {
    stubApi(conversationAt("agent", false));
    renderChat();

    expect(await screen.findByRole("log", { name: "Conversa com o Nexo Assist" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Atendimento" })).toBeDefined();
  });

  it("R38: o clique numa resposta rápida vai marcado, para a api dispensar o classificador", async () => {
    const asked: ConversationView = {
      ...conversationAt("agent", false),
      messages: [
        {
          id: "agent-1",
          role: "assistant",
          metadata: { author: "agent" },
          parts: [
            {
              type: "tool-ask_with_options",
              toolCallId: "c-1",
              state: "output-available",
              input: {},
              output: {
                ok: true,
                question: "Quem está sendo afetado?",
                options: ["Só eu", "Minha equipe"],
              },
            },
          ],
        },
      ],
    };
    const { sentBodies } = stubApi(asked);
    renderChat();

    await userEvent.click(await screen.findByRole("button", { name: /Minha equipe/ }));

    await waitFor(() => expect(sentBodies).toHaveLength(1));
    expect(sentBodies[0]).toMatchObject({ text: "Minha equipe", quickOption: true });
  });

  it("mensagem recusada fica marcada, e Tentar novamente reenvia a mesma (texto e id)", async () => {
    const { sentBodies } = stubApi(conversationAt("agent", false));
    renderChat();

    await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "VPN caiu{Enter}");
    expect(await screen.findByText("Muitas mensagens em pouco tempo.")).toBeDefined();
    expect(screen.getByText("Não enviada")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(sentBodies).toHaveLength(2));
    expect(sentBodies[1]).toEqual(sentBodies[0]);
    expect(sentBodies[0]).toMatchObject({ text: "VPN caiu" });
    expect(typeof (sentBodies[0] as { id?: unknown }).id).toBe("string");
    expect(screen.getAllByText("VPN caiu")).toHaveLength(1);
  });

  it("RF05: detalhes abre o painel da decisão; fechar devolve o foco ao botão", async () => {
    const answered: ConversationView = {
      ...conversationAt("agent", false),
      messages: [
        {
          id: "agent-1",
          role: "assistant",
          metadata: { author: "agent", decision: sampleDecision },
          parts: [{ type: "text", text: "Montei o rascunho D-4." }],
        },
      ],
    };
    stubApi(answered);
    renderChat();

    const details = await screen.findByRole("button", { name: "detalhes da decisão" });
    await userEvent.click(details);

    const panel = screen.getByRole("complementary", { name: "Detalhe da decisão" });
    expect(panel.textContent).toContain("A VPN não conecta e há reunião às 14h.");
    expect(details.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Fechar Detalhe da decisão" }));
    expect(screen.queryByRole("complementary", { name: "Detalhe da decisão" })).toBeNull();
    expect(document.activeElement).toBe(details);
  });

  it("10.6: no celular, o detalhe sobe como folha (diálogo) sobre a conversa", async () => {
    setViewportWidth(390);
    const answered: ConversationView = {
      ...conversationAt("agent", false),
      messages: [
        {
          id: "agent-1",
          role: "assistant",
          metadata: { author: "agent", decision: sampleDecision },
          parts: [{ type: "text", text: "Oi." }],
        },
      ],
    };
    stubApi(answered);
    renderChat();

    await userEvent.click(await screen.findByRole("button", { name: "detalhes da decisão" }));

    expect(screen.getByRole("dialog", { name: "Detalhe da decisão" })).toBeDefined();
  });

  it("resposta ainda sem registro (em streaming, ou falha ao gravar) não tem botão de detalhes", async () => {
    stubApi({
      ...conversationAt("agent", false),
      messages: [
        {
          id: "agent-1",
          role: "assistant",
          metadata: { author: "agent" },
          parts: [{ type: "text", text: "Oi." }],
        },
      ],
    });
    renderChat();

    await screen.findByText("Oi.");
    expect(screen.queryByRole("button", { name: "detalhes da decisão" })).toBeNull();
  });

  describe("detalhe da decisão: foco, teclado e larguras (10.6, 10.7)", () => {
    const answered = (): ConversationView => ({
      ...conversationAt("agent", false),
      messages: [
        {
          id: "agent-1",
          role: "assistant",
          metadata: { author: "agent", decision: sampleDecision },
          parts: [{ type: "text", text: "Montei o rascunho D-4." }],
        },
      ],
    });
    const openDetails = async () => {
      const details = await screen.findByRole("button", { name: "detalhes da decisão" });
      await userEvent.click(details);
      return details;
    };

    it("desktop: o foco vai para o painel ao abrir, e Esc fecha devolvendo o foco", async () => {
      stubApi(answered());
      renderChat();

      const details = await openDetails();

      const close = screen.getByRole("button", { name: "Fechar Detalhe da decisão" });
      expect(document.activeElement).toBe(close);
      expect(details.getAttribute("aria-controls")).toBe(
        screen.getByRole("complementary", { name: "Detalhe da decisão" }).id,
      );
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("complementary", { name: "Detalhe da decisão" })).toBeNull();
      expect(document.activeElement).toBe(details);
    });

    it("clicar de novo em detalhes da mesma resposta fecha o painel", async () => {
      stubApi(answered());
      renderChat();

      const details = await openDetails();
      await userEvent.click(details);

      expect(screen.queryByRole("complementary", { name: "Detalhe da decisão" })).toBeNull();
      expect(details.getAttribute("aria-expanded")).toBe("false");
    });

    it("tablet e notebook (768–1279 px): o detalhe abre como gaveta sobre a conversa", async () => {
      setViewportWidth(1024);
      stubApi(answered());
      renderChat();

      await openDetails();

      expect(screen.getByRole("dialog", { name: "Detalhe da decisão" })).toBeDefined();
    });

    it("celular: Esc fecha a folha e o foco volta para o botão", async () => {
      setViewportWidth(390);
      stubApi(answered());
      renderChat();

      const details = await openDetails();
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog", { name: "Detalhe da decisão" })).toBeNull();
      expect(document.activeElement).toBe(details);
    });
  });

  describe("tela 3: escolher um chamado e a oferta de analista (RF08, RF09, RN07)", () => {
    /** Conversa com a resposta dada e a api que guarda o corpo de cada POST. */
    function stubWithBodies(messages: ConversationView["messages"]) {
      const posts: { path: string; body: unknown }[] = [];
      vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null;
          posts.push({ path: input, body });
        }
        const view = { ...conversationAt("agent", false), messages };
        const body = input === "/api/chat" ? view : {};
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      });
      return posts;
    }

    it("RF08: clicar num chamado da lista manda a escolha, sem passar pelo modelo", async () => {
      const posts = stubWithBodies([
        agentWithTool("a-1", "list_my_tickets", {
          ok: true,
          tickets: [overdueTicket, onTimeTicket],
        }),
      ]);
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: /INC-20298/ }));

      await waitFor(() =>
        expect(posts).toContainEqual({
          path: "/api/chat/actions/select-ticket",
          body: { ticketNumber: "INC-20298" },
        }),
      );
    });

    it("RN07: chamado vencido na última resposta oferece analista, ligado ao chamado", async () => {
      const posts = stubWithBodies([
        agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
      ]);
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: "Falar com um analista" }));

      await waitFor(() =>
        expect(posts).toContainEqual({
          path: "/api/chat/handoff",
          body: { ticketNumber: "INC-20311" },
        }),
      );
    });

    it("Não, obrigado responde pelo código", async () => {
      const posts = stubWithBodies([
        agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
      ]);
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: "Não, obrigado" }));

      await waitFor(() =>
        expect(posts).toContainEqual({
          path: "/api/chat/actions/decline-offer",
          body: { ticketNumber: "INC-20311" },
        }),
      );
    });

    it("Adicionar informação começa a frase no campo de mensagem, com o foco nele", async () => {
      stubWithBodies([
        agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
      ]);
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: "Adicionar informação" }));

      const input = screen.getByLabelText("Mensagem para o Nexo");
      expect(input).toHaveProperty("value", "Quero adicionar uma informação ao INC-20311: ");
      expect(document.activeElement).toBe(input);
    });

    it("sem prazo vencido, ou numa resposta antiga, não há oferta", async () => {
      stubWithBodies([
        agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
        agentWithTool("a-2", "get_ticket", { ok: true, ticket: onTimeTicket }, "Em dia."),
      ]);
      renderChat();

      await screen.findByText("Em dia.");
      expect(screen.queryByRole("button", { name: "Não, obrigado" })).toBeNull();
    });
  });
});
