import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "../../test-setup.ts";
import { LoginPage } from "./LoginPage.tsx";

type ApiReply = { status: number; body: unknown };

/** Respostas da api por rota, para a tela não depender de servidor. */
function stubApi(routes: Record<string, ApiReply>) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    const path = input.replace(/^\/api/, "");
    // O front sempre manda o corpo como texto JSON (api-client.ts).
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ path, body });
    const reply = routes[path] ?? {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "x" } },
    };
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
  });
  return calls;
}

/**
 * Senha qualquer, gerada a cada execução: o login da demonstração aceita qualquer uma, e nenhum
 * valor parecido com credencial fica escrito no código (o GitGuardian acusa pares e-mail/senha).
 */
const ANY_PASSWORD = crypto.randomUUID();

const NO_STATS = {
  status: 200,
  body: { averageReplySeconds: null, answeredWithoutAnalystPercent: null, analystsSignedIn: 0 },
};

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe("tela de login (RF01, tela 1)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("A22: escolher uma conta de demonstração preenche o e-mail e leva o foco à senha", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: /Rafael Lima/ }));

    expect(screen.getByLabelText("E-mail corporativo")).toHaveProperty(
      "value",
      "rafael.lima@nexo.com.br",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Senha"));
  });

  it("envia e-mail, senha e 'manter conectado' para a api", async () => {
    const calls = stubApi({
      "/stats": NO_STATS,
      "/auth/login": {
        status: 200,
        body: { user: { id: "u", name: "Ana", email: "a", role: "employee", department: "x" } },
      },
    });
    renderLogin();

    await userEvent.type(screen.getByLabelText("E-mail corporativo"), "ana.souza@nexo.com.br");
    await userEvent.type(screen.getByLabelText("Senha"), ANY_PASSWORD);
    await userEvent.click(screen.getByLabelText("Manter conectado neste computador"));
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(calls.some((call) => call.path === "/auth/login")).toBe(true));
    expect(calls.find((call) => call.path === "/auth/login")?.body).toEqual({
      email: "ana.souza@nexo.com.br",
      password: ANY_PASSWORD,
      remember: true,
    });
  });

  it("R44: o erro do servidor aparece como alerta", async () => {
    stubApi({
      "/stats": NO_STATS,
      "/auth/login": {
        status: 401,
        body: { error: { code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." } },
      },
    });
    renderLogin();

    await userEvent.type(screen.getByLabelText("E-mail corporativo"), "x@nexo.com.br");
    await userEvent.type(screen.getByLabelText("Senha"), ANY_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("E-mail ou senha inválidos.");
  });

  it("mostrar os caracteres troca o tipo do campo; o botão diz se está ligado", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();
    const password = screen.getByLabelText("Senha");
    const toggle = screen.getByRole("button", { name: "Mostrar os caracteres" });

    await userEvent.click(toggle);

    expect(password.getAttribute("type")).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("'Esqueci minha senha' explica que, na demonstração, qualquer senha entra", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    const forgot = screen.getByRole("button", { name: "Esqueci minha senha" });
    await userEvent.click(forgot);

    // A dica fica numa região anunciada, ligada ao botão que a abre.
    const hint = document.getElementById(forgot.getAttribute("aria-controls") ?? "");
    expect(hint?.getAttribute("aria-live")).toBe("polite");
    expect(hint?.textContent).toBe("Nesta demonstração, qualquer senha entra.");
  });

  it("A11: sem dados ainda, os números aparecem como travessão, não inventados", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    await waitFor(() => expect(screen.getAllByText("ainda sem dados")).toHaveLength(2));
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("0")).toBeDefined();
  });

  it("A11: com dados, mostra os números da api", async () => {
    stubApi({
      "/stats": {
        status: 200,
        body: { averageReplySeconds: 3.8, answeredWithoutAnalystPercent: 72, analystsSignedIn: 2 },
      },
    });
    renderLogin();

    expect(await screen.findByText("3,8 s")).toBeDefined();
    expect(screen.getByText("72%")).toBeDefined();
  });

  it("10.6: no celular, sem o painel escuro, os números nem são buscados", async () => {
    setViewportWidth(390);
    const calls = stubApi({ "/stats": NO_STATS });
    renderLogin();

    await screen.findByRole("heading", { name: "Entrar" });
    expect(calls.some((call) => call.path === "/stats")).toBe(false);
  });

  it("privacidade abre sobreposta mesmo no desktop, sem esmagar o formulário", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Privacidade e uso de dados" }));

    expect(screen.getByRole("dialog", { name: "Privacidade e uso de dados" })).toBeDefined();
  });
});
