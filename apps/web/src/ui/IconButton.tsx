import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx.ts";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  /** Obrigatório: o botão só tem ícone, então o nome dele vem daqui (leitor de tela, testes). */
  label: string;
  icon: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function IconButton({ label, icon, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-md text-ink-3 transition-colors",
        "hover:bg-desk hover:text-ink disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
