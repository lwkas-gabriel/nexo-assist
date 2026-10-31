import type { HTMLAttributes } from "react";
import { cx } from "./cx.ts";

/** Superfície branca com borda e sombra leve, a base dos cards do protótipo. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-lg border border-rule bg-paper shadow-sm", className)} {...props} />
  );
}
