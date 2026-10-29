import { useState, type FormEvent } from "react";
import { useAuth } from "./use-auth.ts";

/** Contas de demonstração (A22): quem avalia o projeto não precisa adivinhar os e-mails. */
const DEMO_ACCOUNTS = [
  { email: "ana.souza@nexo.com.br", label: "Ana Souza (funcionária)" },
  { email: "rafael.lima@nexo.com.br", label: "Rafael Lima (analista N2)" },
];

/**
 * Tela 1 (versão funcional): e-mail corporativo e senha.
 * O layout do protótipo entra na T18.
 */
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ email, password, remember });
  }

  return (
    <main className="login">
      <h1>Nexo Assist</h1>
      <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>

      <form onSubmit={handleSubmit} className="login__form">
        <label>
          E-mail corporativo
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label className="login__remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Manter conectado neste computador
        </label>

        {login.error && (
          <p role="alert" className="login__error">
            {login.error.message}
          </p>
        )}

        <button type="submit" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <details className="login__demo">
        <summary>Contas de demonstração</summary>
        <p>Qualquer senha funciona.</p>
        <ul>
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <code>{account.email}</code>: {account.label}
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
