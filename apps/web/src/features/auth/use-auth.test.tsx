import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./use-auth.ts";

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
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(() => result.current.logout.mutateAsync());

    expect(window.location.hash).toBe("");
  });
});
