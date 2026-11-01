import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_KEY, expireSession, SESSION_EXPIRED_MESSAGE, useAuth } from "./use-auth.ts";

const ANA = {
  id: "emp-ana-souza",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  role: "employee",
  department: "Financeiro",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("sessão do usuário (useAuth)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("ao sair, o hash da página some da URL: quem entra depois não cai no perfil de quem saiu", async () => {
    vi.stubGlobal("fetch", (input: string) =>
      Promise.resolve(
        new Response(JSON.stringify(input === "/api/auth/me" ? { user: ANA } : {}), {
          status: 200,
        }),
      ),
    );
    window.location.hash = "#/perfil";
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.userView.status).toBe("ready"));

    await act(() => result.current.logout.mutateAsync());

    expect(window.location.hash).toBe("");
  });

  it("10.3: expireSession esvazia o cache, limpa o hash, tira o usuário e deixa o aviso", () => {
    const client = new QueryClient();
    client.setQueryData(CURRENT_USER_KEY, ANA);
    client.setQueryData(["conversation"], { messages: ["conteúdo do usuário anterior"] });
    window.location.hash = "#/perfil";

    expireSession(client);

    expect(window.location.hash).toBe("");
    expect(client.getQueryData(CURRENT_USER_KEY)).toBeNull();
    expect(client.getQueryData(["conversation"])).toBeUndefined();
    expect(client.getQueryData(["session-notice"])).toBe(SESSION_EXPIRED_MESSAGE);
  });
});
