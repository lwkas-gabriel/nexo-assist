import type { ReactNode } from "react";
import { isMacPlatform, modifierKeyLabel } from "../lib/platform.ts";
import { Button } from "./Button.tsx";
import { cx } from "./cx.ts";
import { TONE_CLASSES, type Tone } from "./status-styles.ts";

export const RETRY_LABEL = "Tentar novamente";
export const RETRYING_LABEL = "Tentando…";

/** Bloco de carregamento (10.5). Só visual: quem carrega anuncia com aria-busy. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-rule", className)} />;
}

/**
 * Carregando (10.5). O rótulo é lido pelo leitor de tela; os blocos de skeleton são só visuais e
 * ficam escondidos da árvore de acessibilidade.
 */
export function LoadingState({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

/**
 * "Tentar novamente" que vira "Tentando…" enquanto a nova tentativa corre. Fica `aria-disabled` e
 * não `disabled`: um botão desabilitado perde o foco, e quem usa o teclado cairia no `<body>`.
 */
export function RetryButton({
  onRetry,
  isRetrying = false,
}: {
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      onClick={isRetrying ? undefined : onRetry}
      aria-disabled={isRetrying}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      {isRetrying ? RETRYING_LABEL : RETRY_LABEL}
    </Button>
  );
}

/**
 * Erro de carregamento (10.5): o que aconteceu e, quando dá para tentar de novo, o botão. Sem
 * `autoFocus`: roubar o foco de quem digita ao lado seria pior que o erro (AI_LOG 68).
 */
export function ErrorState({
  message,
  onRetry,
  isRetrying = false,
  className,
}: {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx("flex flex-col items-center gap-3 px-6 py-6 text-center", className)}
    >
      <p className="text-[14.5px] text-ink-2">{message}</p>
      {onRetry && <RetryButton onRetry={onRetry} isRetrying={isRetrying} />}
    </div>
  );
}

/**
 * Aviso de que a tela está desatualizada (o polling falhou, mas os dados antigos continuam
 * úteis). Como o `Toast`, a região fica sempre montada e só o texto muda (10.7).
 */
export function SyncNotice({
  message,
  action,
  className,
}: {
  message: string | null;
  /** Uma saída, quando nada vai tentar de novo sozinho (ex.: o botão "Tentar novamente"). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={className}>
      {message && (
        <div className="flex items-center justify-center gap-3 px-4">
          <p className="text-center text-[12.5px] text-ink-3">{message}</p>
          {action}
        </div>
      )}
    </div>
  );
}

/** Lista vazia (10.5): "Você não tem chamados abertos", "Nenhuma conversa neste filtro". */
export function EmptyState({
  icon,
  title,
  description,
  action,
  isCompact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Uma saída para quem chegou aqui, como "Limpar busca". */
  action?: ReactNode;
  /** Menos respiro, para caber como cartão no meio de uma conversa. */
  isCompact?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-2 px-6 text-center",
        isCompact ? "py-4" : "py-10",
      )}
    >
      {icon && (
        <span aria-hidden className="text-ink-3">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-xs text-[13px] text-ink-3">{description}</p>}
      {action}
    </div>
  );
}

/** Tecla de atalho. Com `withModifier`, mostra ⌘ ou Ctrl conforme o sistema (R33). */
export function Kbd({
  keyName,
  withModifier = false,
}: {
  keyName: string;
  withModifier?: boolean;
}) {
  const label = withModifier ? `${modifierKeyLabel(isMacPlatform())}+${keyName}` : keyName;
  return (
    <kbd className="rounded-sm border border-rule bg-desk px-1.5 py-0.5 font-data text-[11px] text-ink-3">
      {label}
    </kbd>
  );
}

/**
 * Região de avisos (ex.: "Rascunho cancelado"). Fica sempre montada, vazia, e só o texto muda:
 * leitores de tela costumam ignorar uma região que já nasce com o texto. Erro usa `alert`, que
 * interrompe; o resto, `status`, que espera. Quem usa decide quando limpar a mensagem.
 */
export function Toast({ message, tone = "neutral" }: { message: string | null; tone?: Tone }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"}>
      {message && (
        <div
          className={cx(
            "rounded-md px-4 py-2.5 text-[13px] font-medium shadow-card",
            TONE_CLASSES[tone],
          )}
        >
          {message}
        </div>
      )}
    </div>
  );
}
