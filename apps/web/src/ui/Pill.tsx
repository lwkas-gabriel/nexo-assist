import type { ReactNode } from "react";
import { cx } from "./cx.ts";
import { TONE_CLASSES, TONE_DOT_CLASSES, type Tone } from "./status-styles.ts";

type PillProps = {
  tone: Tone;
  children: ReactNode;
  /** Ponto colorido antes do texto, como em "Assistente online". */
  withDot?: boolean;
  className?: string;
};

/** Pílula de status (raio 999), com a cor do mapa de status (10.2). */
export function Pill({ tone, children, withDot = false, className }: PillProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {withDot && (
        <span aria-hidden className={cx("size-1.5 rounded-full", TONE_DOT_CLASSES[tone])} />
      )}
      {children}
    </span>
  );
}
