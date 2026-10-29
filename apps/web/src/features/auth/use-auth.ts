import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, login, logout, type LoginInput } from "./auth-api.ts";

const CURRENT_USER_KEY = ["current-user"] as const;

/** Sessão do usuário: quem está logado, entrar e sair. O servidor guarda a sessão num cookie. */
export function useAuth() {
  const queryClient = useQueryClient();
  const currentUser = useQuery({ queryKey: CURRENT_USER_KEY, queryFn: fetchCurrentUser });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    // Ao sair, nada do usuário anterior fica em memória (inclusive a conversa).
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });

  return {
    user: currentUser.data ?? null,
    isLoading: currentUser.isPending,
    loadError: currentUser.error,
    login: loginMutation,
    logout: logoutMutation,
  };
}
