import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";

const NO_STATS = {
  averageReplySeconds: null,
  answeredWithoutAnalystPercent: null,
  analystsSignedIn: 0,
};

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<App client={client} />);
}

describe("início do app (quem está logado?)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("10.5: com a api fora do ar, oferece Tentar novamente e, voltando, mostra o login", async () => {
    let isOffline = true;
    vi.stubGlobal("fetch", (input: string) => {
      if (isOffline) return Promise.reject(new TypeError("Failed to fetch"));
      const reply =
        input === "/api/auth/me"
          ? new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "x" } }), {
              status: 401,
            })
          : new Response(JSON.stringify(NO_STATS));
      return Promise.resolve(reply);
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
