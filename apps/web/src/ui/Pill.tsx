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

/** Pílula de status (raio 999, padding 5/10, texto de 12,5 px), com a cor do mapa de status. */
export function Pill({ tone, children, withDot = false, className }: PillProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[12.5px] leading-none font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {withDot && (
        <span aria-hidden className={cx("size-[7px] rounded-full", TONE_DOT_CLASSES[tone])} />
      )}
      {children}
    </span>
  );
}
