import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { useAuth } from "./features/auth/use-auth.ts";
import { ChatPage } from "./features/chat/ChatPage.tsx";
import { ConsolePage } from "./features/console/ConsolePage.tsx";

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

/** Decide a tela pelo usuário logado: login, chat do funcionário ou console do analista. */
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

  // Telas 4 e 5: o console do analista.
  return (
    <ConsolePage user={user} isLoggingOut={logout.isPending} onLogout={() => logout.mutate()} />
  );
}
