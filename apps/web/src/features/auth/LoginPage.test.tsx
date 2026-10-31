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

const NO_STATS = {
  status: 200,
  body: { firstResponseSeconds: null, resolvedWithoutQueuePercent: null, analystsOnline: 0 },
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
    await userEvent.type(screen.getByLabelText("Senha"), "qualquer");
    await userEvent.click(screen.getByLabelText("Manter conectado neste computador"));
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(calls.some((call) => call.path === "/auth/login")).toBe(true));
    expect(calls.find((call) => call.path === "/auth/login")?.body).toEqual({
      email: "ana.souza@nexo.com.br",
      password: "qualquer",
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
    await userEvent.type(screen.getByLabelText("Senha"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("E-mail ou senha inválidos.");
  });

  it("mostrar os caracteres troca o tipo do campo de senha", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();
    const password = screen.getByLabelText("Senha");

    await userEvent.click(screen.getByRole("button", { name: "Mostrar os caracteres" }));

    expect(password.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Esconder os caracteres" })).toBeDefined();
  });

  it("'Esqueci minha senha' explica que, na demonstração, qualquer senha entra", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));

    expect(screen.getByText("Nesta demonstração, qualquer senha entra.")).toBeDefined();
  });

  it("A11: sem dados ainda, os números aparecem como travessão, não inventados", async () => {
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    await waitFor(() => expect(screen.getAllByText("—")).toHaveLength(2));
    expect(screen.getByText("0")).toBeDefined();
  });

  it("A11: com dados, mostra os números da api", async () => {
    stubApi({
      "/stats": {
        status: 200,
        body: { firstResponseSeconds: 3.8, resolvedWithoutQueuePercent: 72, analystsOnline: 2 },
      },
    });
    renderLogin();

    expect(await screen.findByText("3,8 s")).toBeDefined();
    expect(screen.getByText("72%")).toBeDefined();
  });

  it("10.6: abaixo de 1024 px, a tela é só o formulário (sem o painel escuro)", () => {
    setViewportWidth(390);
    stubApi({ "/stats": NO_STATS });
    renderLogin();

    // O painel existe no HTML, mas o CSS o esconde abaixo de lg; o formulário continua.
    expect(screen.getByRole("region", { name: "Sobre o Nexo Assist" }).className).toContain(
      "hidden",
    );
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeDefined();
  });
});
