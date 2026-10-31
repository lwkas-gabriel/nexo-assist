import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { useAuth } from "./features/auth/use-auth.ts";
import { ChatPage } from "./features/chat/ChatPage.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthenticatedArea />
    </QueryClientProvider>
  );
}

/** Decide a tela pelo usuário logado: login, chat do funcionário ou (em breve) console do analista. */
function AuthenticatedArea() {
  const { user, isLoading, loadError, logout } = useAuth();

  if (isLoading) {
    return (
      <p aria-busy="true" className="p-6 text-[13.5px] text-ink-3">
        Carregando…
      </p>
    );
  }
  if (loadError) {
    return (
      <p role="alert" className="p-6 text-[13.5px] text-danger-text">
        {loadError.message}
      </p>
    );
  }
  if (!user) return <LoginPage />;

  if (user.role === "employee") {
    return (
      <ChatPage user={user} isLoggingOut={logout.isPending} onLogout={() => logout.mutate()} />
    );
  }

  // Console do analista: telas 4 e 5, nas tarefas T23 e T24.
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-desk px-6 text-center">
      <p className="text-[14.5px] text-ink-2">
        {user.name}, o console do analista chega nas próximas tarefas.
      </p>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="text-[13.5px] font-semibold text-primary-text hover:underline"
      >
        Sair
      </button>
    </main>
  );
}
