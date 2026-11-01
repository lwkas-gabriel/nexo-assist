import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client.ts";
import { useQueryView } from "./use-query-view.ts";

const KEY = ["lista"] as const;
const FAILURE = "O sistema de chamados não respondeu.";

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useQueryView (10.5)", () => {
  it("falha de antes de a tela abrir, ainda no cache, não vira o alerta de agora: carrega", async () => {
    const client = newClient();
    await client
      .fetchQuery({
        queryKey: KEY,
        queryFn: () => Promise.reject(new ApiError("TICKETS_UNAVAILABLE", FAILURE, 503)),
      })
      .catch(() => undefined);
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const { result } = renderHook(
      () =>
        useQueryView(
          useQuery({
            queryKey: KEY,
            queryFn: async () => {
              await gate;
              return ["a"];
            },
          }),
        ).view,
      { wrapper: wrapperFor(client) },
    );

    expect(result.current).toEqual({ status: "loading" });
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("a falha vista nesta tela segue na nova tentativa, com a mesma mensagem (não a genérica)", async () => {
    let attempts = 0;
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { result } = renderHook(
      () => {
        const query = useQuery({
          queryKey: KEY,
          queryFn: async () => {
            attempts += 1;
            if (attempts === 1) throw new ApiError("TICKETS_UNAVAILABLE", FAILURE, 503);
            await gate;
            return ["a"];
          },
        });
        return { query, view: useQueryView(query).view };
      },
      { wrapper: wrapperFor(newClient()) },
    );
    await waitFor(() => expect(result.current.view).toEqual({ status: "error", message: FAILURE }));

    act(() => void result.current.query.refetch());

    await waitFor(() => expect(result.current.query.isFetching).toBe(true));
    expect(result.current.view).toEqual({ status: "error", message: FAILURE });
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(result.current.view.status).toBe("ready"));
  });
});
