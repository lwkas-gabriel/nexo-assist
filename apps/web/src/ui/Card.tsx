import type { HTMLAttributes } from "react";
import { cx } from "./cx.ts";

/**
 * Superfície dos cards do protótipo (rascunho, chamado, seletor, perfil): raio de 16 px, borda
 * translúcida e a sombra de card.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-xl border border-line bg-paper shadow-card", className)}
      {...props}
    />
  );
}
