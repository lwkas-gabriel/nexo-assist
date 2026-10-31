import { QueryClient } from "@tanstack/react-query";

/** O cliente de consultas do app: sem tentativas automáticas (a tela oferece "Tentar novamente"). */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
