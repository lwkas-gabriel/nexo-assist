import type { ReactNode } from "react";
import { isMacPlatform, modifierKeyLabel } from "../lib/platform.ts";
import { cx } from "./cx.ts";
import { TONE_CLASSES, type Tone } from "./status-styles.ts";

/** Bloco de carregamento (10.5). Só visual: quem carrega anuncia com aria-busy. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-rule", className)} />;
}

/** Lista vazia (10.5): "Você não tem chamados abertos", "Nenhuma conversa neste filtro". */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && (
        <span aria-hidden className="text-ink-3">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-xs text-[13px] text-ink-3">{description}</p>}
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

/** Aviso passageiro, anunciado ao leitor de tela sem roubar o foco. */
export function Toast({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        "rounded-md px-4 py-2.5 text-[13px] font-medium shadow-card",
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </div>
  );
}
