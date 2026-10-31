import { DEMO_USERS } from "@nexo/shared/demo";

/** Quem aparece primeiro: a Ana tem os chamados das telas do protótipo; o Rafael é o analista. */
const HIGHLIGHTED = ["ana.souza@nexo.com.br", "rafael.lima@nexo.com.br"];

const sorted = [...DEMO_USERS].sort(
  (a, b) => rank(a.email) - rank(b.email) || a.name.localeCompare(b.name, "pt-BR"),
);

function rank(email: string): number {
  const index = HIGHLIGHTED.indexOf(email);
  return index === -1 ? HIGHLIGHTED.length : index;
}

/**
 * Contas de demonstração (A22, R37): quem avalia o projeto não precisa adivinhar os e-mails.
 * Clicar numa conta preenche o e-mail; qualquer senha entra (requisito do desafio). Ficam à vista
 * as duas que cobrem as telas do protótipo; as outras, em "Outras contas".
 */
export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const highlighted = sorted.filter((user) => HIGHLIGHTED.includes(user.email));
  const others = sorted.filter((user) => !HIGHLIGHTED.includes(user.email));

  return (
    <section aria-labelledby="demo-accounts-title" className="border-t border-rule pt-4">
      <h2 id="demo-accounts-title" className="text-[13px] font-semibold text-ink-2">
        Contas de demonstração
      </h2>
      <p className="mt-0.5 text-[12.5px] text-ink-3">Escolha uma conta. Qualquer senha entra.</p>
      <AccountList users={highlighted} onPick={onPick} />
      <details className="mt-2 text-[12.5px] text-ink-3">
        <summary className="cursor-pointer hover:text-ink-2">
          Outras contas ({others.length})
        </summary>
        <AccountList users={others} onPick={onPick} />
      </details>
    </section>
  );
}

function AccountList({
  users,
  onPick,
}: {
  users: readonly (typeof DEMO_USERS)[number][];
  onPick: (email: string) => void;
}) {
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5">
      {users.map((user) => (
        <li key={user.email}>
          <button
            type="button"
            onClick={() => onPick(user.email)}
            className="rounded-full border border-line-strong bg-paper px-2.5 py-1 text-[12.5px] text-ink-2 hover:bg-desk"
          >
            {user.name}
            <span className="text-ink-3">
              {" "}
              · {user.role === "analyst" ? `analista, ${user.department}` : user.department}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
