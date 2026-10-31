import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx.ts";

const VARIANT_CLASSES = {
  primary: "bg-cta text-paper shadow-cta hover:bg-primary-hover",
  secondary: "border border-rule bg-paper text-ink shadow-sm hover:bg-desk",
  "danger-soft": "bg-danger-soft text-danger-text hover:bg-danger/15",
  ghost: "text-ink-2 hover:bg-desk",
} as const;

const SIZE_CLASSES = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
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
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
