import type { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { createAppQueryClient } from "./features/auth/app-query-client.ts";
import type { CurrentUser } from "./features/auth/auth-api.ts";

const NO_STATS = {
  averageReplySeconds: null,
  answeredWithoutAnalystPercent: null,
  analystsSignedIn: 0,
};

const ANA: CurrentUser = {
  id: "emp-ana-souza",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  role: "employee",
  department: "Financeiro",
};

const EMPTY_CONVERSATION = { conversation: null, session: null, messages: [], drafts: [] };
const UNAUTHORIZED = {
  error: { code: "UNAUTHORIZED", message: "Faça login para continuar." },
};
const SESSION_EXPIRED = "Sua sessão expirou. Entre de novo para continuar.";

/** O app de verdade (com os tratamentos de 401), num cache só deste teste. */
function renderApp(client: QueryClient = createAppQueryClient()) {
  return render(<App client={client} />);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/**
 * A api de quem está logado: assim que a rota `expiringPath` responde 401, a sessão acabou e
 * `/auth/me` também passa a responder 401 (a tela de login pergunta de novo quem está logado).
 */
function stubExpiringSession(
  expiringPath: string,
  extra?: (input: string, init?: RequestInit) => Response | undefined,
) {
  let isSessionOpen = true;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    const custom = extra?.(input, init);
    if (custom) return Promise.resolve(custom);
    if (input === "/api/auth/me") {
      return Promise.resolve(isSessionOpen ? json({ user: ANA }) : json(UNAUTHORIZED, 401));
    }
    if (input === expiringPath) {
      isSessionOpen = false;
      return Promise.resolve(json(UNAUTHORIZED, 401));
    }
    return Promise.resolve(json(NO_STATS));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("início do app (quem está logado?)", () => {
  it("10.5: com a api fora do ar, oferece Tentar novamente e, voltando, mostra o login", async () => {
    let isOffline = true;
    vi.stubGlobal("fetch", (input: string) => {
      if (isOffline) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(input === "/api/auth/me" ? json(UNAUTHORIZED, 401) : json(NO_STATS));
    });
    renderApp();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível falar com o servidor",
    );
    isOffline = false;
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("sessão expirada (10.3)", () => {
  it("logado, um 401 ao carregar a conversa volta ao login com o aviso", async () => {
    stubExpiringSession("/api/chat");
    renderApp();

    expect(await screen.findByText(SESSION_EXPIRED)).toBeDefined();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeDefined();
    expect(screen.queryByLabelText("Mensagem para o Nexo")).toBeNull();
  });

  it("a tela de login não pergunta de novo quem está logado: a sessão dada como expirada fica expirada", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (input: string) => {
      asked.push(input);
      if (input === "/api/auth/me") return Promise.resolve(json({ user: ANA }));
      if (input === "/api/chat") return Promise.resolve(json(UNAUTHORIZED, 401));
      return Promise.resolve(json(NO_STATS));
    });
    renderApp();

    await screen.findByText(SESSION_EXPIRED);

    expect(asked.filter((path) => path === "/api/auth/me")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeDefined();
  });

  it("o hash da página some, para a próxima pessoa não cair no perfil de quem estava", async () => {
    window.location.hash = "#/perfil";
    stubExpiringSession("/api/chat");
    renderApp();

    await screen.findByText(SESSION_EXPIRED);

    expect(window.location.hash).toBe("");
  });

  it("um 401 no envio da mensagem (o stream) também volta ao login com o aviso", async () => {
    stubExpiringSession("/api/chat/messages", (input) =>
      input === "/api/chat" ? json(EMPTY_CONVERSATION) : undefined,
    );
    renderApp();

    await userEvent.type(await screen.findByLabelText("Mensagem para o Nexo"), "Oi{Enter}");

    expect(await screen.findByText(SESSION_EXPIRED)).toBeDefined();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeDefined();
  });

  it("o 401 de E-mail ou senha inválidos NÃO é sessão expirada: sem o aviso", async () => {
    vi.stubGlobal("fetch", (input: string) => {
      if (input === "/api/auth/me") return Promise.resolve(json(UNAUTHORIZED, 401));
      if (input === "/api/auth/login") {
        return Promise.resolve(
          json({ error: { code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." } }, 401),
        );
      }
      return Promise.resolve(json(NO_STATS));
    });
    renderApp();

    await userEvent.type(await screen.findByLabelText("E-mail corporativo"), "ana@nexo.com.br");
    await userEvent.type(screen.getByLabelText("Senha"), crypto.randomUUID());
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("E-mail ou senha inválidos.");
    expect(screen.queryByText(SESSION_EXPIRED)).toBeNull();
  });

  it("depois do aviso, entrar de novo tira o aviso da tela", async () => {
    let isSessionOpen = true;
    // A primeira carga da conversa é a que encontra a sessão já expirada.
    let isFirstChatLoad = true;
    vi.stubGlobal("fetch", (input: string) => {
      if (input === "/api/auth/me") {
        return Promise.resolve(isSessionOpen ? json({ user: ANA }) : json(UNAUTHORIZED, 401));
      }
      if (input === "/api/chat") {
        if (isSessionOpen && !isFirstChatLoad) return Promise.resolve(json(EMPTY_CONVERSATION));
        isFirstChatLoad = false;
        isSessionOpen = false;
        return Promise.resolve(json(UNAUTHORIZED, 401));
      }
      if (input === "/api/auth/login") {
        isSessionOpen = true;
        return Promise.resolve(json({ user: ANA }));
      }
      return Promise.resolve(json(NO_STATS));
    });
    renderApp();
    await screen.findByText(SESSION_EXPIRED);

    await userEvent.type(screen.getByLabelText("E-mail corporativo"), "ana.souza@nexo.com.br");
    await userEvent.type(screen.getByLabelText("Senha"), crypto.randomUUID());
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByLabelText("Mensagem para o Nexo")).toBeDefined();
    expect(screen.queryByText(SESSION_EXPIRED)).toBeNull();
  });
});
