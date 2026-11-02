import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.ts";
import { CURRENT_USER_KEY, expireSession } from "./use-auth.ts";

const UNAUTHORIZED_STATUS = 401;

/**
 * Um 401 de qualquer consulta ou ação de quem está logado é a sessão que acabou (10.3). Sem
 * ninguém logado, o 401 é só o login errado ("E-mail ou senha inválidos") e não leva aviso.
 */
function expireSessionOnUnauthorized(client: QueryClient, error: unknown) {
  if (!(error instanceof ApiError) || error.status !== UNAUTHORIZED_STATUS) return;
  if (!client.getQueryData(CURRENT_USER_KEY)) return;
  expireSession(client);
}

/** O cliente de consultas do app: sem tentativas automáticas (a tela oferece "Tentar novamente"). */
export function createAppQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => expireSessionOnUnauthorized(client, error) }),
    mutationCache: new MutationCache({
      onError: (error) => expireSessionOnUnauthorized(client, error),
    }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return client;
}
