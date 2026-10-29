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

  if (isLoading) return <p className="chat__status">Carregando…</p>;
  if (loadError) {
    return (
      <p role="alert" className="chat__error">
        {loadError.message}
      </p>
    );
  }
  if (!user) return <LoginPage />;

  return (
    <main className="chat">
      <header className="chat__header">
        <h1>Nexo Assist</h1>
        <p>
          {user.name} · {user.email}
        </p>
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sair
        </button>
      </header>
      {user.role === "employee" ? (
        <ChatPage />
      ) : (
        <p>Console do analista: em construção (tarefas T23 e T24).</p>
      )}
    </main>
  );
}
