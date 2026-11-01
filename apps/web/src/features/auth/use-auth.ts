import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { clearPageHash } from "../../lib/use-hash-page.ts";
import { fetchCurrentUser, login, logout, type LoginInput } from "./auth-api.ts";

export const CURRENT_USER_KEY = ["current-user"] as const;
/** O aviso que a tela de login mostra (ex.: sessão expirada); guardado no cache, como o usuário. */
const SESSION_NOTICE_KEY = ["session-notice"] as const;
export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre de novo para continuar.";

/**
 * A api respondeu 401 a quem estava logado (10.3): a sessão acabou. Volta ao login com um aviso,
 * sem nada do usuário anterior em memória (como ao sair). Quem chama garante que havia alguém
 * logado: o 401 de "E-mail ou senha inválidos" não é sessão expirada.
 */
export function expireSession(queryClient: QueryClient) {
  // Não usa `clear()`: ele tira do cache as consultas que a tela de sessão ainda observa, e elas
  // não avisariam a tela da mudança. Fora essas duas, tudo do usuário anterior sai da memória.
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey[0] !== CURRENT_USER_KEY[0] && query.queryKey[0] !== SESSION_NOTICE_KEY[0],
  });
  clearPageHash();
  queryClient.setQueryData(CURRENT_USER_KEY, null);
  queryClient.setQueryData(SESSION_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
}

/** Sessão do usuário: quem está logado, entrar e sair. O servidor guarda a sessão num cookie. */
export function useAuth() {
  const queryClient = useQueryClient();
  // Quem está logado só muda por entrar, sair ou a sessão expirar, e os três gravam o resultado:
  // sem perguntar de novo a cada vez que uma tela monta (a do login, ao expirar, não pode reabrir
  // a sessão que acabou de ser dada como expirada).
  const currentUser = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchCurrentUser,
    staleTime: Infinity,
  });
  // Só guarda o que `expireSession` põe no cache: nunca busca nada.
  const sessionNotice = useQuery<string | null>({
    queryKey: SESSION_NOTICE_KEY,
    queryFn: () => null,
    enabled: false,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (user) => {
      queryClient.setQueryData(SESSION_NOTICE_KEY, null);
      queryClient.setQueryData(CURRENT_USER_KEY, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    // Ao sair, nada do usuário anterior fica em memória (inclusive a conversa).
    onSettled: () => {
      queryClient.clear();
      clearPageHash();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });

  return {
    user: currentUser.data ?? null,
    isLoading: currentUser.isPending,
    loadError: currentUser.error,
    /** O aviso para a tela de login, ou null. */
    sessionNotice: sessionNotice.data ?? null,
    /** Tentar de novo a pergunta "quem está logado?" depois de uma falha. */
    retry: () => void currentUser.refetch(),
    isRetrying: currentUser.isFetching,
    login: loginMutation,
    logout: logoutMutation,
  };
}
