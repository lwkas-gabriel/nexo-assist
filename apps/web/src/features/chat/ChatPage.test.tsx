import type { ConversationMode } from "@nexo/shared/domain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "../../test-setup.ts";
import type { CurrentUser } from "../auth/auth-api.ts";
import type { ConversationView, DraftView } from "./chat-api.ts";
import { ANNOUNCE_AFTER_MOUNT_MS } from "../../lib/use-announce-after-mount.ts";
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

const RAFAEL = { name: "Rafael Lima", department: "Suporte N2" };

function conversationAt(mode: ConversationMode, isAtLimit: boolean): ConversationView {
  return {
    conversation: { id: "c-1", mode, analyst: mode === "analyst" ? RAFAEL : null },
    session: {
      agentMessages: isAtLimit ? 30 : 12,
      limit: 30,
      isAtLimit,
      startedAt: "2026-10-31T12:00:00.000Z",
      previousSummary: null,
    },
    messages: [],
    drafts: [],
    isBusy: false,
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
  // A página vem do hash da URL, que o jsdom compartilha entre os testes do arquivo.
  afterEach(() => {
    window.location.hash = "";
  });

  it("RN14: no limite, falar com um analista transfere e devolve o campo de mensagem", async () => {
    const { calls } = stubApi(
      conversationAt("agent", true),
      conversationAt("waiting_analyst", true),
    );
    renderChat();

    await userEvent.click(await screen.findByRole("button", { name: "Falar com um analista" }));

    expect(await screen.findByLabelText("Mensagem para o analista")).toBeDefined();
    expect(screen.queryByText(/Limite desta sessão atingido/)).toBeNull();
    expect(calls).toContain("POST /api/chat/handoff");
  });

  it("RN14: com a conversa no analista, o limite do agent não bloqueia o funcionário", async () => {
    stubApi(conversationAt("analyst", true));
    renderChat();

    expect(await screen.findByLabelText("Mensagem para o analista")).toBeDefined();
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
    function stubWithBodies(
      messages: ConversationView["messages"],
      base: ConversationView = conversationAt("agent", false),
      failingPost?: string,
    ) {
      const posts: { path: string; body: unknown }[] = [];
      vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null;
          posts.push({ path: input, body });
          if (input === failingPost) {
            const error = {
              error: { code: "CONFLICT", message: "Essa oferta não está mais valendo." },
            };
            return Promise.resolve(new Response(JSON.stringify(error), { status: 409 }));
          }
        }
        const view = { ...base, messages };
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

    it("10.5: lista vazia vira um cartão, conforme o filtro que o agent pediu", async () => {
      stubWithBodies([
        agentWithTool("a-1", "list_my_tickets", { ok: true, tickets: [] }, "", { filter: "open" }),
        agentWithTool("a-2", "list_my_tickets", { ok: true, tickets: [] }, "", { filter: "all" }),
      ]);
      renderChat();

      expect(await screen.findByText("Você não tem chamados abertos")).toBeDefined();
      expect(screen.getByText("Você não tem chamados")).toBeDefined();
      expect(screen.queryByRole("list", { name: "Seus chamados" })).toBeNull();
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

    describe("sistema de chamados instável (10.5)", () => {
      const unstable = (id: string) =>
        agentWithTool(
          id,
          "list_my_tickets",
          { ok: false, reason: "tickets_unavailable" },
          "O sistema de chamados está instável agora.",
        );

      it("o chip diz que tentou 3×, sem o código interno, e oferece só o analista", async () => {
        stubWithBodies([unstable("a-1")]);
        renderChat();

        const chip = (await screen.findByText("sistema de chamados instável, tentei 3×"))
          .parentElement;
        // O chip que não concluiu leva o ícone de aviso, não o ✓ de ação feita.
        expect(chip?.querySelector(".lucide-triangle-alert")).not.toBeNull();
        expect(chip?.querySelector(".lucide-check")).toBeNull();
        expect(screen.queryByText(/tickets_unavailable/)).toBeNull();
        expect(screen.getByRole("button", { name: "Falar com um analista" })).toBeDefined();
        expect(screen.queryByRole("button", { name: "Não, obrigado" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Adicionar informação" })).toBeNull();
      });

      it("clicar chama o analista pelo código, sem chamado ligado", async () => {
        const posts = stubWithBodies([unstable("a-1")]);
        renderChat();

        await userEvent.click(await screen.findByRole("button", { name: "Falar com um analista" }));

        await waitFor(() => expect(posts).toContainEqual({ path: "/api/chat/handoff", body: {} }));
      });

      it("a tela ainda velha pede o analista de novo: a api responde com sucesso, sem alerta nem texto interno", async () => {
        const posts = stubWithBodies([unstable("a-1")]);
        renderChat();
        const ask = await screen.findByRole("button", { name: "Falar com um analista" });

        await userEvent.click(ask);
        await waitFor(() => expect(posts).toHaveLength(1));
        // O recarregamento ainda trouxe a conversa antiga (oferta ainda na tela): o segundo clique.
        await userEvent.click(await screen.findByRole("button", { name: "Falar com um analista" }));

        await waitFor(() => expect(posts).toHaveLength(2));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByText(/waiting_analyst|handoff/)).toBeNull();
      });

      it("numa resposta antiga, o chip fica como registro e a oferta some", async () => {
        stubWithBodies([
          unstable("a-1"),
          agentWithTool("a-2", "search_knowledge_base", { ok: true }, "Ok."),
        ]);
        renderChat();

        expect(await screen.findByText("sistema de chamados instável, tentei 3×")).toBeDefined();
        expect(screen.queryByRole("button", { name: "Falar com um analista" })).toBeNull();
      });

      it("com um analista na conversa, não há oferta", async () => {
        stubWithBodies([unstable("a-1")], conversationAt("waiting_analyst", false));
        renderChat();

        await screen.findByText("sistema de chamados instável, tentei 3×");
        expect(screen.queryByRole("button", { name: "Falar com um analista" })).toBeNull();
      });
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

    it("lista e chamado consultados no mesmo turno: o card basta, sem seletor", async () => {
      const both = agentWithTool(
        "a-1",
        "get_ticket",
        { ok: true, ticket: overdueTicket },
        "Venceu.",
      );
      both.parts.unshift({
        type: "tool-list_my_tickets",
        toolCallId: "c-list",
        state: "output-available",
        input: {},
        output: { ok: true, tickets: [overdueTicket, onTimeTicket] },
      });
      stubWithBodies([both]);
      renderChat();

      await screen.findByRole("region", { name: "Chamado INC-20311" });
      expect(screen.queryByRole("list", { name: "Seus chamados" })).toBeNull();
    });

    it("RN14: no limite da sessão, a oferta não tem Adicionar informação", async () => {
      stubWithBodies(
        [agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu.")],
        conversationAt("agent", true),
      );
      renderChat();

      await screen.findByRole("button", { name: "Não, obrigado" });
      expect(screen.queryByRole("button", { name: "Adicionar informação" })).toBeNull();
    });

    it("RN08: com a conversa no analista, nem oferta nem seletor", async () => {
      stubWithBodies(
        [
          agentWithTool("a-1", "list_my_tickets", { ok: true, tickets: [onTimeTicket] }),
          agentWithTool("a-2", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
        ],
        conversationAt("analyst", false),
      );
      renderChat();

      await screen.findByText("Venceu.");
      expect(screen.queryByRole("button", { name: "Não, obrigado" })).toBeNull();
      expect(screen.getByRole("button", { name: /INC-20298/ })).toHaveProperty("disabled", true);
    });

    it("o erro de uma ação aparece na resposta em que ela foi feita", async () => {
      stubWithBodies(
        [agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu.")],
        conversationAt("agent", false),
        "/api/chat/actions/decline-offer",
      );
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: "Não, obrigado" }));

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Essa oferta não está mais valendo.",
      );
    });
  });

  describe("conversa com os analistas (RF17, R27)", () => {
    const analystSays = (id: string, text: string) => ({
      id,
      role: "assistant" as const,
      metadata: { author: "analyst", analyst: RAFAEL },
      parts: [{ type: "text" as const, text }],
    });

    it("a pílula diz quem atende, e o campo avisa que as mensagens vão para o analista", async () => {
      stubApi({ ...conversationAt("analyst", false), messages: [analystSays("m-1", "Oi, Ana.")] });
      renderChat();

      expect(await screen.findByText("Com Rafael Lima · Suporte N2")).toBeDefined();
      expect(screen.getByText("Rafael Lima").parentElement?.textContent).toBe(
        "Rafael Lima · Suporte N2",
      );
      expect(screen.getByLabelText("Mensagem para o analista").getAttribute("placeholder")).toBe(
        "Escreva para o analista…",
      );
      expect(
        screen.getByText("Suas mensagens vão para o analista · contador pausado em 12/30"),
      ).toBeDefined();
    });

    it("aguardando analista, a resposta dele chega sozinha (polling curto)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let current: ConversationView = conversationAt("waiting_analyst", false);
        vi.stubGlobal("fetch", (input: string) =>
          Promise.resolve(
            new Response(JSON.stringify(input === "/api/chat" ? current : {}), { status: 200 }),
          ),
        );
        renderChat();
        await screen.findByText("Aguardando analista");

        current = {
          ...conversationAt("analyst", false),
          messages: [analystSays("m-1", "Oi, Ana. Já estou com seu chamado.")],
        };
        await vi.advanceTimersByTimeAsync(3100);

        expect(await screen.findByText("Oi, Ana. Já estou com seu chamado.")).toBeDefined();
        expect(screen.getByText("Com Rafael Lima · Suporte N2")).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("sincronia com o servidor: nada some, nada se perde (revisão da T22)", () => {
    const employeeSays = (id: string, text: string) => ({
      id,
      role: "user" as const,
      metadata: { author: "employee" },
      parts: [{ type: "text" as const, text }],
    });
    const analystSays = (id: string, text: string) => ({
      id,
      role: "assistant" as const,
      metadata: { author: "analyst", analyst: RAFAEL },
      parts: [{ type: "text" as const, text }],
    });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    /** Resposta do agent em streaming, no formato do AI SDK. */
    const stream = (chunks: unknown[]) =>
      new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
        {
          status: 200,
          headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        },
      );

    it("fim do turno com o recarregamento ainda a caminho: pergunta e resposta ficam na tela", async () => {
      let gets = 0;
      let sentId = "";
      let releaseRefresh = () => undefined as void;
      const refreshGate = new Promise<void>((resolve) => (releaseRefresh = resolve));
      vi.stubGlobal("fetch", async (_input: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          sentId = (JSON.parse(typeof init.body === "string" ? init.body : "{}") as { id: string })
            .id;
          return stream([
            { type: "start", messageId: "a-1" },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Resposta do agent" },
            { type: "text-end", id: "t1" },
            { type: "finish" },
          ]);
        }
        gets += 1;
        if (gets === 1) return json(conversationAt("agent", false));
        await refreshGate;
        return json({
          ...conversationAt("agent", false),
          messages: [
            employeeSays(sentId, "Minha VPN caiu"),
            { ...analystSays("a-1", "Resposta do agent"), metadata: { author: "agent" } },
          ],
        });
      });
      renderChat();

      await userEvent.type(
        await screen.findByLabelText("Mensagem para o Nexo"),
        "Minha VPN caiu{Enter}",
      );
      await waitFor(() => expect(gets).toBe(2));

      expect(screen.getByText("Minha VPN caiu")).toBeDefined();
      expect(screen.getByText("Resposta do agent")).toBeDefined();
      await act(() => {
        releaseRefresh();
        return refreshGate;
      });
      expect(screen.getByText("Minha VPN caiu")).toBeDefined();
    });

    it("um polling antigo em curso não apaga a mensagem que acabou de ser enviada", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let saved: unknown[] = [analystSays("m-1", "Oi, Ana.")];
        let gets = 0;
        let releasePoll = () => undefined as void;
        const pollGate = new Promise<void>((resolve) => (releasePoll = resolve));
        vi.stubGlobal("fetch", async (_input: string, init?: RequestInit) => {
          if (init?.method === "POST") {
            const { id, text } = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
              id: string;
              text: string;
            };
            saved = [...saved, employeeSays(id, text)];
            return stream([]);
          }
          gets += 1;
          const snapshot = { ...conversationAt("analyst", false), messages: saved };
          if (gets === 2) await pollGate;
          return json(snapshot);
        });
        renderChat();
        await screen.findByText("Oi, Ana.");
        await vi.advanceTimersByTimeAsync(3050);

        await userEvent.type(screen.getByLabelText("Mensagem para o analista"), "Alô{Enter}");
        await act(() => {
          releasePoll();
          return pollGate;
        });
        await vi.advanceTimersByTimeAsync(50);

        expect(screen.getByText("Alô")).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("com uma falha de envio na tela, as respostas do analista continuam chegando", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let current = {
          ...conversationAt("analyst", false),
          messages: [analystSays("m-1", "Oi, Ana.")],
        };
        vi.stubGlobal("fetch", (_input: string, init?: RequestInit) =>
          Promise.resolve(
            init?.method === "POST"
              ? json(
                  { error: { code: "RATE_LIMITED", message: "Muitas mensagens em pouco tempo." } },
                  429,
                )
              : json(current),
          ),
        );
        renderChat();
        await screen.findByText("Oi, Ana.");
        await userEvent.type(screen.getByLabelText("Mensagem para o analista"), "Alô{Enter}");
        await screen.findByText("Muitas mensagens em pouco tempo.");

        current = {
          ...current,
          messages: [analystSays("m-1", "Oi, Ana."), analystSays("m-2", "Pode reiniciar?")],
        };
        await vi.advanceTimersByTimeAsync(3100);

        expect(await screen.findByText("Pode reiniciar?")).toBeDefined();
        expect(screen.getByText("Alô")).toBeDefined();
        expect(screen.getByText("Não enviada")).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("polling que falha mantém a conversa e o que estava sendo digitado", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let gets = 0;
        vi.stubGlobal("fetch", () => {
          gets += 1;
          return Promise.resolve(
            gets === 2
              ? json({ error: { code: "INTERNAL", message: "Falhou." } }, 502)
              : json({
                  ...conversationAt("analyst", false),
                  messages: [analystSays("m-1", "Oi, Ana.")],
                }),
          );
        });
        renderChat();
        await screen.findByText("Oi, Ana.");
        await userEvent.type(
          screen.getByLabelText("Mensagem para o analista"),
          "texto em andamento",
        );

        await vi.advanceTimersByTimeAsync(3100);

        expect(screen.getByText("Oi, Ana.")).toBeDefined();
        expect(screen.getByLabelText("Mensagem para o analista")).toHaveProperty(
          "value",
          "texto em andamento",
        );
        expect(await screen.findByText(/Não consegui atualizar a conversa agora/)).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("com o agent, o recarregamento do fim do turno falha: o aviso não promete nova tentativa e oferece o botão", async () => {
      let gets = 0;
      let isReloadDown = false;
      vi.stubGlobal("fetch", (_input: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          isReloadDown = true;
          return Promise.resolve(stream([]));
        }
        gets += 1;
        return Promise.resolve(
          isReloadDown
            ? json({ error: { code: "INTERNAL", message: "Falhou." } }, 502)
            : json(conversationAt("agent", false)),
        );
      });
      renderChat();
      await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "Oi{Enter}");

      const notice = await screen.findByText("Não consegui atualizar a conversa agora.");
      expect(screen.queryByText(/tentando de novo/)).toBeNull();
      isReloadDown = false;
      await userEvent.click(
        within(notice.parentElement as HTMLElement).getByRole("button", {
          name: "Tentar novamente",
        }),
      );

      await waitFor(() =>
        expect(screen.queryByText("Não consegui atualizar a conversa agora.")).toBeNull(),
      );
      expect(gets).toBeGreaterThanOrEqual(3);
    });

    it("RT10: com o agent, não há polling", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let gets = 0;
        vi.stubGlobal("fetch", () => {
          gets += 1;
          return Promise.resolve(json(conversationAt("agent", false)));
        });
        renderChat();
        await screen.findByLabelText("Mensagem para o Nexo");

        await vi.advanceTimersByTimeAsync(10_000);

        expect(gets).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("navegação para Meu perfil (T25, 10.3)", () => {
    it("o link da navegação abre o perfil e marca a página atual; voltar reabre o chat", async () => {
      stubApi(conversationAt("agent", false));
      renderChat();
      await screen.findByLabelText("Mensagem para o Nexo");
      // Na carga inicial o foco não é roubado.
      expect(document.activeElement).toBe(document.body);

      await userEvent.click(screen.getAllByRole("link", { name: "Meu perfil" })[0] as HTMLElement);

      const title = await screen.findByRole("heading", { level: 1, name: "Meu perfil" });
      expect(
        screen.getAllByRole("link", { name: "Meu perfil" })[0]?.getAttribute("aria-current"),
      ).toBe("page");
      // A troca de página leva o foco ao título novo (anuncia a página e parte dali).
      expect(document.activeElement).toBe(title);
      // No perfil, a conversa e a pílula de status não aparecem (protótipo: só o breadcrumb).
      expect(screen.queryByRole("textbox", { name: "Mensagem para o Nexo" })).toBeNull();
      expect(screen.queryByText("Assistente online")).toBeNull();

      await userEvent.click(screen.getAllByRole("link", { name: "Atendimento" })[0] as HTMLElement);

      expect(await screen.findByRole("textbox", { name: "Mensagem para o Nexo" })).toBeDefined();
      expect(screen.getByText("Assistente online")).toBeDefined();
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 1, name: "Atendimento" }),
      );
    });

    it("no celular, o link do topo troca de ícone e de rótulo, e o título acompanha", async () => {
      stubApi(conversationAt("agent", false));
      renderChat();
      await screen.findByLabelText("Mensagem para o Nexo");
      // Os links da lateral vêm antes no documento; o do topo é o último.
      const topLink = () =>
        screen.getAllByRole("link", { name: /Meu perfil|Voltar ao atendimento/ }).at(-1);
      expect(topLink()?.getAttribute("aria-label")).toBe("Meu perfil");
      expect(topLink()?.querySelector(".lucide-user-round")).not.toBeNull();

      await userEvent.click(topLink() as HTMLElement);

      expect(await screen.findByRole("heading", { level: 1, name: "Meu perfil" })).toBeDefined();
      expect(topLink()?.getAttribute("aria-label")).toBe("Voltar ao atendimento");
      expect(topLink()?.getAttribute("href")).toBe("#/");
      expect(topLink()?.querySelector(".lucide-message-square")).not.toBeNull();
      expect(screen.queryByRole("heading", { level: 1, name: "Atendimento" })).toBeNull();
    });

    it("a conversa e o perfil ficam dentro de um landmark main, o mesmo ao trocar de página", async () => {
      stubApi(conversationAt("agent", false));
      renderChat();
      const field = await screen.findByLabelText("Mensagem para o Nexo");

      const main = screen.getByRole("main");
      expect(main.contains(field)).toBe(true);
      expect(within(main).getByRole("log", { name: "Conversa com o Nexo Assist" })).toBeDefined();

      await userEvent.click(screen.getAllByRole("link", { name: "Meu perfil" })[0] as HTMLElement);
      await screen.findByRole("heading", { level: 1, name: "Meu perfil" });

      // Nada remonta: o campo continua o mesmo nó (escondido), e o perfil está no mesmo main.
      expect(screen.getByRole("main")).toBe(main);
      expect(main.contains(field)).toBe(true);
      expect(within(main).getByRole("heading", { level: 2, name: "Meu perfil" })).toBeDefined();
    });

    it("o texto digitado no campo sobrevive a Atendimento, Meu perfil e Atendimento", async () => {
      stubApi(conversationAt("agent", false));
      renderChat();
      await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "minha VPN caiu");

      await userEvent.click(screen.getAllByRole("link", { name: "Meu perfil" })[0] as HTMLElement);
      await screen.findByRole("heading", { level: 1, name: "Meu perfil" });
      await userEvent.click(screen.getAllByRole("link", { name: "Atendimento" })[0] as HTMLElement);

      expect(await screen.findByRole("textbox", { name: "Mensagem para o Nexo" })).toHaveProperty(
        "value",
        "minha VPN caiu",
      );
    });

    it("trocar para o perfil no meio de um envio não aborta a requisição; a conversa segue", async () => {
      const encoder = new TextEncoder();
      let current = conversationAt("agent", false);
      let signal: AbortSignal | null | undefined;
      let sentId = "";
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => void (streamController = controller),
      });
      const sse = (chunk: unknown) => encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
      vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        if (init?.method === "POST" && input === "/api/chat/messages") {
          signal = init.signal;
          sentId = (JSON.parse(init.body as string) as { id: string }).id;
          return Promise.resolve(
            new Response(stream, {
              headers: {
                "content-type": "text/event-stream",
                "x-vercel-ai-ui-message-stream": "v1",
              },
            }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify(current), { status: 200 }));
      });
      renderChat();
      await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "VPN caiu{Enter}");
      await waitFor(() => expect(signal).toBeDefined());
      streamController?.enqueue(sse({ type: "start" }));
      streamController?.enqueue(sse({ type: "text-start", id: "t1" }));
      streamController?.enqueue(sse({ type: "text-delta", id: "t1", delta: "Vou olhar a VPN" }));

      await userEvent.click(screen.getAllByRole("link", { name: "Meu perfil" })[0] as HTMLElement);
      await screen.findByRole("heading", { level: 1, name: "Meu perfil" });

      // Sem o abort, o servidor não grava a resposta parcial como final (RN14).
      expect(signal?.aborted).toBe(false);

      current = {
        ...current,
        messages: [
          {
            id: sentId,
            role: "user",
            metadata: { author: "employee" },
            parts: [{ type: "text", text: "VPN caiu" }],
          },
          {
            id: "agent-1",
            role: "assistant",
            metadata: { author: "agent" },
            parts: [{ type: "text", text: "Vou olhar a VPN agora." }],
          },
        ],
      };
      streamController?.enqueue(sse({ type: "text-delta", id: "t1", delta: " agora." }));
      streamController?.enqueue(sse({ type: "text-end", id: "t1" }));
      streamController?.enqueue(sse({ type: "finish" }));
      streamController?.close();
      await userEvent.click(screen.getAllByRole("link", { name: "Atendimento" })[0] as HTMLElement);

      expect(await screen.findByText("Vou olhar a VPN agora.")).toBeDefined();
      expect(screen.getAllByText("VPN caiu")).toHaveLength(1);
      expect(signal?.aborted).toBe(false);
    });
  });

  describe("foco depois de enviar (10.7)", () => {
    // O botão "Enviar" fica desabilitado quando o texto é limpo e, num navegador real, o foco cai
    // no <body>. O jsdom não reproduz isso; o E2E (e2e/focus.spec.ts) cobre. Aqui, o contrato: o
    // foco vai ao campo, como na resposta rápida.
    it("clicar em Enviar leva o foco de volta ao campo de mensagem", async () => {
      stubApi(conversationAt("agent", false));
      renderChat();
      const field = await screen.findByLabelText("Mensagem para o Nexo");
      await userEvent.type(field, "VPN caiu");

      await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

      expect(document.activeElement).toBe(field);
    });

    it("Tentar novamente do alerta de falha leva o foco ao campo de mensagem", async () => {
      stubApi(conversationAt("agent", false));
      renderChat();
      const field = await screen.findByLabelText("Mensagem para o Nexo");
      await userEvent.type(field, "VPN caiu{Enter}");
      await userEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));

      expect(document.activeElement).toBe(field);
    });

    it("Tentar novamente da bolha interrompida leva o foco ao campo de mensagem", async () => {
      stubApi({
        ...conversationAt("agent", false),
        messages: [
          {
            id: "e-1",
            role: "user",
            metadata: { author: "employee" },
            parts: [{ type: "text", text: "Minha VPN caiu" }],
          },
        ],
      });
      renderChat();
      const field = await screen.findByLabelText("Mensagem para o Nexo");
      await userEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));

      expect(document.activeElement).toBe(field);
    });
  });

  describe("limite da sessão e foco (RN14, 10.7)", () => {
    const encoder = new TextEncoder();
    const sse = (chunks: readonly unknown[]) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            controller.close();
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
          },
        },
      );
    const ANSWER_CHUNKS = [
      { type: "start" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Feito." },
      { type: "text-end", id: "t1" },
      { type: "finish" },
    ];

    /** Uma api em que o envio dá certo e a mensagem seguinte já esgota (ou não) o limite. */
    function stubSendReachingLimit(isLimitReachedBySend: boolean) {
      let current = conversationAt("agent", false);
      vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        if (init?.method === "POST" && input === "/api/chat/messages") {
          if (isLimitReachedBySend) current = conversationAt("agent", true);
          return Promise.resolve(sse(ANSWER_CHUNKS));
        }
        if (init?.method === "POST" && input === "/api/chat/sessions") {
          current = conversationAt("agent", false);
        }
        return Promise.resolve(new Response(JSON.stringify(current), { status: 200 }));
      });
    }

    it("a mensagem que esgota o limite leva o foco ao texto do aviso, não ao <body>", async () => {
      stubSendReachingLimit(true);
      renderChat();
      await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "VPN caiu{Enter}");

      const notice = await screen.findByText(/Limite desta sessão atingido\./);
      await waitFor(() => expect(document.activeElement).toBe(notice.closest("p")));
    });

    it("abrir a conversa já no limite não move o foco", async () => {
      stubApi(conversationAt("agent", true));
      renderChat();

      await screen.findByText(/Limite desta sessão atingido\./);

      expect(document.activeElement).toBe(document.body);
    });

    it("a região viva do aviso nasce vazia e o texto entra depois", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        stubApi(conversationAt("agent", true));
        renderChat();
        const notice = await screen.findByText(/Limite desta sessão atingido\./);
        const region = within(notice.closest("div")?.parentElement as HTMLElement).getByRole(
          "status",
        );
        expect(region.textContent).toBe("");

        await act(() => vi.advanceTimersByTimeAsync(ANNOUNCE_AFTER_MOUNT_MS + 10));
        expect(region.textContent).toBe("Limite desta sessão atingido.");
      } finally {
        vi.useRealTimers();
      }
    });

    it("Nova sessão devolve o foco ao campo que reaparece", async () => {
      let current = conversationAt("agent", true);
      vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
        if (init?.method === "POST" && input === "/api/chat/sessions") {
          current = conversationAt("agent", false);
        }
        return Promise.resolve(new Response(JSON.stringify(current), { status: 200 }));
      });
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: "Nova sessão" }));

      const field = await screen.findByLabelText("Mensagem para o Nexo");
      await waitFor(() => expect(document.activeElement).toBe(field));
    });

    it("Falar com um analista, no limite, devolve o foco ao campo que reaparece", async () => {
      stubApi(conversationAt("agent", true), conversationAt("waiting_analyst", true));
      renderChat();

      await userEvent.click(await screen.findByRole("button", { name: "Falar com um analista" }));

      const field = await screen.findByLabelText("Mensagem para o analista");
      await waitFor(() => expect(document.activeElement).toBe(field));
    });
  });

  describe("foco depois de uma ação que falha (10.7)", () => {
    const CONFLICT = {
      error: { code: "CONFLICT", message: "Essa ação não está mais valendo." },
    };
    const pendingDraft: DraftView = {
      draftId: "D-7",
      number: 7,
      kind: "create",
      status: "pending",
      ticketNumber: null,
      ticket: {
        title: "VPN não conecta no notebook",
        description: "Desde ontem o notebook não conecta na VPN.",
        type: "Incidente",
        category: "Rede e VPN",
        affected: "Somente você",
        priority: "Alta",
        priorityReason: null,
        slaRule: "4 horas úteis",
        firstResponseBy: "27/10, 13:43",
      },
      fields: {
        title: "VPN não conecta no notebook",
        description: "Desde ontem o notebook não conecta na VPN.",
        type: "incident",
        category: "network_vpn",
        affected: "just_me",
        urgency: "deadline_today",
      },
    };

    /**
     * A api com um POST que fica pendente até `release()` e então falha com 409. Enquanto ele
     * corre, o teste faz o que o navegador faz com um botão que fica desabilitado: tira dele o
     * foco (o jsdom não o faz; o E2E em e2e/focus.spec.ts prova num navegador de verdade).
     */
    function stubHeldFailure(view: ConversationView, failingPath: string) {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
        if (init?.method === "POST" && input === failingPath) {
          await gate;
          return new Response(JSON.stringify(CONFLICT), { status: 409 });
        }
        if (init?.method === "POST" && input === "/api/chat/messages") {
          return new Response(JSON.stringify(RATE_LIMITED), { status: 429 });
        }
        return new Response(JSON.stringify(input === "/api/chat" ? view : {}), { status: 200 });
      });
      return {
        failNow: async (button: HTMLElement, { isFocusLost = true } = {}) => {
          await waitFor(() => expect(button).toHaveProperty("disabled", true));
          if (isFocusLost && document.activeElement === button) {
            // O jsdom não solta o foco de um botão desabilitado, e `blur()` nele não faz nada.
            button.removeAttribute("disabled");
            button.blur();
            button.setAttribute("disabled", "");
          }
          if (isFocusLost) expect(document.activeElement).toBe(document.body);
          await act(async () => {
            release();
            await gate;
          });
        },
      };
    }

    it("Confirmar que falha devolve o foco ao botão", async () => {
      const view: ConversationView = {
        ...conversationAt("agent", false),
        messages: [agentWithTool("a-1", "propose_ticket_draft", { ok: true, draft: pendingDraft })],
        drafts: [pendingDraft],
      };
      const { failNow } = stubHeldFailure(view, "/api/chat/drafts/7/confirm");
      renderChat();
      const confirm = await screen.findByRole("button", { name: /Confirmar/ });

      await userEvent.click(confirm);
      await failNow(confirm);

      expect(await screen.findByText("Essa ação não está mais valendo.")).toBeDefined();
      await waitFor(() => expect(document.activeElement).toBe(confirm));
    });

    it("a oferta de analista que falha devolve o foco ao botão clicado", async () => {
      const view: ConversationView = {
        ...conversationAt("agent", false),
        messages: [
          agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
        ],
      };
      const { failNow } = stubHeldFailure(view, "/api/chat/handoff");
      renderChat();
      const decline = await screen.findByRole("button", { name: "Falar com um analista" });

      await userEvent.click(decline);
      await failNow(decline);

      expect(await screen.findByText("Essa ação não está mais valendo.")).toBeDefined();
      await waitFor(() => expect(document.activeElement).toBe(decline));
    });

    it("Falar com um analista, no alerta de falha, devolve o foco ao botão se a transferência falha", async () => {
      const { failNow } = stubHeldFailure(conversationAt("agent", false), "/api/chat/handoff");
      renderChat();
      await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "VPN caiu{Enter}");
      const alert = await screen.findByRole("alert");
      const talk = within(alert).getByRole("button", { name: "Falar com um analista" });

      await userEvent.click(talk);
      await failNow(talk);

      await waitFor(() => expect(document.activeElement).toBe(talk));
    });

    it("quem levou o foco para outro lugar enquanto a ação corria o mantém lá", async () => {
      const view: ConversationView = {
        ...conversationAt("agent", false),
        messages: [
          agentWithTool("a-1", "get_ticket", { ok: true, ticket: overdueTicket }, "Venceu."),
        ],
      };
      const { failNow } = stubHeldFailure(view, "/api/chat/handoff");
      renderChat();
      const decline = await screen.findByRole("button", { name: "Falar com um analista" });
      await userEvent.click(decline);
      const field = screen.getByLabelText("Mensagem para o Nexo");
      field.focus();

      await failNow(decline, { isFocusLost: false });

      expect(await screen.findByText("Essa ação não está mais valendo.")).toBeDefined();
      expect(document.activeElement).toBe(field);
    });
  });

  describe("estados de carregamento e erro (10.5, RF23)", () => {
    it("carregando: skeleton anunciado, e a pílula não afirma que o assistente está online", async () => {
      vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
      renderChat();

      expect(await screen.findByText("Carregando sua conversa")).toBeDefined();
      expect(screen.queryByText("Assistente online")).toBeNull();
      expect(screen.queryByLabelText("Mensagem para o Nexo")).toBeNull();
    });

    it("erro de rede ao carregar: mensagem honesta, sem pílula, e Tentar novamente carrega a conversa", async () => {
      let isOffline = true;
      vi.stubGlobal("fetch", () =>
        isOffline
          ? Promise.reject(new TypeError("Failed to fetch"))
          : Promise.resolve(new Response(JSON.stringify(conversationAt("agent", false)))),
      );
      renderChat();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Não foi possível falar com o servidor");
      expect(screen.queryByText("Assistente online")).toBeNull();
      expect(document.activeElement).toBe(document.body);

      isOffline = false;
      await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByLabelText("Mensagem para o Nexo")).toBeDefined();
      expect(screen.getByText("Assistente online")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("enquanto tenta de novo, o botão diz Tentando… e fica aria-disabled", async () => {
      let attempts = 0;
      let release = () => undefined as void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.stubGlobal("fetch", async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        await gate;
        return new Response(JSON.stringify(conversationAt("agent", false)));
      });
      renderChat();
      await userEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));

      const busy = await screen.findByRole("button", { name: "Tentando…" });
      expect(busy.getAttribute("aria-disabled")).toBe("true");
      await act(() => {
        release();
        return gate;
      });
      expect(await screen.findByLabelText("Mensagem para o Nexo")).toBeDefined();
    });
  });

  describe("resposta interrompida (10.5)", () => {
    const employeeAsks = (id: string, text: string) => ({
      id,
      role: "user" as const,
      metadata: { author: "employee" },
      parts: [{ type: "text" as const, text }],
    });
    const endingInEmployee = (mode: ConversationMode = "agent"): ConversationView => ({
      ...conversationAt(mode, false),
      messages: [employeeAsks("e-1", "Minha VPN caiu")],
    });

    it("a conversa que termina numa mensagem do funcionário marca a bolha; Tentar novamente reenvia o mesmo id e texto", async () => {
      const { sentBodies } = stubApi(endingInEmployee());
      renderChat();

      expect(await screen.findByText("Resposta interrompida")).toBeDefined();
      expect(screen.queryByText("Não enviada")).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

      await waitFor(() => expect(sentBodies).toHaveLength(1));
      expect(sentBodies[0]).toMatchObject({ id: "e-1", text: "Minha VPN caiu" });
      expect(screen.getAllByText("Minha VPN caiu")).toHaveLength(1);
    });

    it("se o reenvio também falha, só o alerta de falha aparece, nunca os dois", async () => {
      stubApi(endingInEmployee());
      renderChat();
      await userEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));

      expect(await screen.findByText("Muitas mensagens em pouco tempo.")).toBeDefined();
      expect(screen.queryByText("Resposta interrompida")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Tentar novamente" })).toHaveLength(1);
    });

    it("com a conversa esperando um analista, ou com ele, não é interrupção", async () => {
      stubApi(endingInEmployee("waiting_analyst"));
      renderChat();

      await screen.findByText("Aguardando analista");
      expect(screen.getByText("Minha VPN caiu")).toBeDefined();
      expect(screen.queryByText("Resposta interrompida")).toBeNull();
    });

    it("com a trava da conversa tomada (turno em curso no servidor), não é interrupção; a resposta chega ao terminar", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let current: ConversationView = { ...endingInEmployee(), isBusy: true };
        vi.stubGlobal("fetch", (input: string) =>
          Promise.resolve(
            new Response(JSON.stringify(input === "/api/chat" ? current : {}), { status: 200 }),
          ),
        );
        renderChat();
        expect(await screen.findByText("Minha VPN caiu")).toBeDefined();
        expect(screen.queryByText("Resposta interrompida")).toBeNull();

        current = {
          ...conversationAt("agent", false),
          messages: [
            employeeAsks("e-1", "Minha VPN caiu"),
            {
              id: "a-1",
              role: "assistant",
              metadata: { author: "agent" },
              parts: [{ type: "text", text: "Vou olhar." }],
            },
          ],
        };
        await vi.advanceTimersByTimeAsync(3100);

        expect(await screen.findByText("Vou olhar.")).toBeDefined();
        expect(screen.queryByText("Resposta interrompida")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("se o turno em curso termina sem resposta gravada, a marca aparece só então", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        let current: ConversationView = { ...endingInEmployee(), isBusy: true };
        vi.stubGlobal("fetch", (input: string) =>
          Promise.resolve(
            new Response(JSON.stringify(input === "/api/chat" ? current : {}), { status: 200 }),
          ),
        );
        renderChat();
        await screen.findByText("Minha VPN caiu");
        expect(screen.queryByText("Resposta interrompida")).toBeNull();

        current = endingInEmployee();
        await vi.advanceTimersByTimeAsync(3100);

        expect(await screen.findByText("Resposta interrompida")).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a conversa que termina numa resposta do agent não tem marca", async () => {
      stubApi({
        ...conversationAt("agent", false),
        messages: [
          employeeAsks("e-1", "Minha VPN caiu"),
          {
            id: "a-1",
            role: "assistant",
            metadata: { author: "agent" },
            parts: [{ type: "text", text: "Vou olhar." }],
          },
        ],
      });
      renderChat();

      expect(await screen.findByText("Vou olhar.")).toBeDefined();
      expect(screen.queryByText("Resposta interrompida")).toBeNull();
    });
  });
});
