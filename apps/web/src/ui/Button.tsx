import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx.ts";

const VARIANT_CLASSES = {
  primary: "bg-cta font-semibold text-paper hover:bg-primary-hover",
  secondary: "border border-line-strong bg-paper font-medium text-ink hover:bg-desk",
  "danger-soft": "bg-danger-soft font-semibold text-danger-text hover:bg-danger/15",
  ghost: "font-medium text-ink-2 hover:bg-desk",
} as const;

/**
 * Medidas do protótipo: as ações têm 36 px e texto de 13,5 px; o "Entrar" do login, 44 px e
 * 15,5 px. Só o botão grande primário leva a sombra azul do CTA.
 */
const SIZE_CLASSES = {
  md: "h-9 px-4 text-[13.5px]",
  lg: "h-11 px-5 text-[15.5px]",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE_CLASSES;
};

/** Botão do protótipo: primário (CTA azul), secundário, perigo suave ou fantasma. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        variant === "primary" && size === "lg" && "shadow-cta",
        className,
      )}
      {...props}
    />
  );
}
