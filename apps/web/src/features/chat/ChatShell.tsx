import type { ConversationMode } from "@nexo/shared/domain";
import { ChevronRight, LogOut, MessageSquare, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "../../ui/Avatar.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Pill } from "../../ui/Pill.tsx";
import { CONVERSATION_MODE_TONES } from "../../ui/status-styles.ts";
import type { CurrentUser } from "../auth/auth-api.ts";
import { PAGE_HREFS, type EmployeePage } from "../../lib/use-hash-page.ts";
import { cx } from "../../ui/cx.ts";
import type { AnalystView } from "./chat-api.ts";
import { NexoMark } from "../auth/NexoMark.tsx";

/**
 * O que a pílula do topo diz em cada estado da conversa; com um analista, o nome e o setor dele
 * (R27). "closed" é o fechamento administrativo (11.3): a tela do funcionário não o recebe.
 */
const MODE_LABELS: Record<ConversationMode, string> = {
  agent: "Assistente online",
  waiting_analyst: "Aguardando analista",
  analyst: "Com um analista",
  closed: "Atendimento encerrado",
};

type ChatShellProps = {
  user: CurrentUser;
  /** Atendimento ou "Meu perfil" (10.3): a navegação marca a atual e o título acompanha. */
  page: EmployeePage;
  mode: ConversationMode;
  /** Quem atende, com a conversa num analista: a pílula diz o nome e o setor (R27). */
  analyst: AnalystView | null;
  isLoggingOut: boolean;
  onLogout: () => void;
  children: ReactNode;
};

/**
 * Moldura da tela 2 (10.6): barra lateral a partir de 1024 px, trilho de ícones no tablet e barra
 * no topo no celular. As mesmas peças em todas as larguras.
 */
export function ChatShell({
  user,
  page,
  mode,
  analyst,
  isLoggingOut,
  onLogout,
  children,
}: ChatShellProps) {
  const modeLabel =
    mode === "analyst" && analyst
      ? `Com ${analyst.name} · ${analyst.department}`
      : MODE_LABELS[mode];
  return (
    <div className="flex h-dvh bg-paper">
      <nav
        aria-label="Navegação principal"
        className="hidden shrink-0 flex-col border-r border-rule px-3.5 pt-5 pb-3.5 md:flex md:w-16 md:items-center lg:w-[232px] lg:items-stretch"
      >
        <div className="flex items-center gap-2.5 px-2">
          <NexoMark tone="onLight" />
          <span className="hidden text-base font-bold tracking-[-0.2px] text-ink lg:inline">
            Nexo Assist
          </span>
        </div>
        <ul className="mt-[22px] flex flex-col gap-0.5">
          <li>
            <NavLink href={PAGE_HREFS.chat} isCurrent={page === "chat"} label="Atendimento">
              <MessageSquare size={16} aria-hidden />
            </NavLink>
          </li>
          <li>
            <NavLink href={PAGE_HREFS.profile} isCurrent={page === "profile"} label="Meu perfil">
              <UserRound size={16} aria-hidden />
            </NavLink>
          </li>
        </ul>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 border-t border-rule px-2 pt-3.5 pb-1">
          <Avatar name={user.name} size="sm" />
          <div className="hidden min-w-0 flex-col lg:flex">
            <span className="truncate text-[13.5px] font-semibold text-ink">{user.name}</span>
            <span className="truncate text-[11.5px] text-ink-3">{user.email}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          title="Sair"
          className="mt-1 flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk"
        >
          <LogOut size={16} aria-hidden className="text-ink-3" />
          <span className="hidden lg:inline">Sair</span>
          <span className="sr-only lg:hidden">Sair</span>
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-rule px-4 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <NexoMark tone="onLight" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
            <span className="hidden text-ink-3 md:inline">Service desk de TI</span>
            <ChevronRight size={14} aria-hidden className="hidden text-ink-3 md:block" />
            {/* O título da página; no celular, só para o leitor de tela (a marca ocupa o topo). */}
            <h1 className="sr-only font-semibold text-ink md:not-sr-only">{PAGE_TITLES[page]}</h1>
          </div>
          {/* Região de status: o leitor de tela ouve a troca (transferida, com analista, de volta). */}
          <span role="status">
            <Pill tone={mode === "agent" ? "success" : CONVERSATION_MODE_TONES[mode]} withDot>
              {modeLabel}
            </Pill>
          </span>
          {/* No celular, a barra do topo faz o papel da lateral: perfil (ou volta) e sair. */}
          <a
            href={page === "chat" ? PAGE_HREFS.profile : PAGE_HREFS.chat}
            aria-label={page === "chat" ? "Meu perfil" : "Voltar ao atendimento"}
            className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk md:hidden"
          >
            {page === "chat" ? (
              <UserRound size={16} aria-hidden />
            ) : (
              <MessageSquare size={16} aria-hidden />
            )}
          </a>
          <IconButton
            label="Sair"
            icon={<LogOut size={16} />}
            onClick={onLogout}
            disabled={isLoggingOut}
            className="md:hidden"
          />
        </header>
        {children}
      </div>
    </div>
  );
}

const PAGE_TITLES: Record<EmployeePage, string> = {
  chat: "Atendimento",
  profile: "Meu perfil",
};

function NavLink({
  href,
  isCurrent,
  label,
  children,
}: {
  href: string;
  isCurrent: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={label}
      title={label}
      className={cx(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px]",
        isCurrent
          ? "bg-primary-soft font-semibold text-primary-text"
          : "font-medium text-ink-2 hover:bg-desk",
      )}
    >
      {children}
      {/* No trilho (tablet), só o ícone: o nome vem do aria-label. */}
      <span aria-hidden className="hidden lg:inline">
        {label}
      </span>
    </a>
  );
}
