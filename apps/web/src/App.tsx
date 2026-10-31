import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "./features/auth/app-query-client.ts";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { useAuth } from "./features/auth/use-auth.ts";
import { ChatPage } from "./features/chat/ChatPage.tsx";
import { ConsolePage } from "./features/console/ConsolePage.tsx";
import { ErrorState, LoadingState, Skeleton } from "./ui/Feedback.tsx";

const appQueryClient = createAppQueryClient();

/** `client` só muda nos testes, que não podem dividir o cache entre si. */
export function App({ client = appQueryClient }: { client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <AuthenticatedArea />
    </QueryClientProvider>
  );
}

/** Decide a tela pelo usuário logado: login, chat do funcionário ou console do analista. */
function AuthenticatedArea() {
  const { user, isLoading, loadError, isRetrying, retry, logout } = useAuth();

  if (isLoading) {
    return (
      <LoadingState label="Carregando…" className="flex min-h-dvh items-center justify-center p-6">
        <Skeleton className="h-10 w-64" />
      </LoadingState>
    );
  }
  if (loadError) {
    return (
      <ErrorState
        message={loadError.message}
        onRetry={retry}
        isRetrying={isRetrying}
        className="min-h-dvh justify-center"
      />
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
