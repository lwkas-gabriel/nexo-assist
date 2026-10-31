import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx.ts";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  /** Ícone à esquerda, dentro do campo (ex.: envelope no e-mail). */
  icon?: ReactNode;
  hint?: string;
  error?: string;
};

/** Campo com rótulo ligado ao input; dica e erro anunciados ao leitor de tela. */
export function TextField({ label, icon, hint, error, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      <div
        className={cx(
          "flex h-11 items-center gap-2 rounded-md border bg-paper px-3 focus-within:border-primary",
          error ? "border-danger" : "border-rule",
        )}
      >
        {icon && (
          <span aria-hidden className="text-ink-3">
            {icon}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          {...props}
        />
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
