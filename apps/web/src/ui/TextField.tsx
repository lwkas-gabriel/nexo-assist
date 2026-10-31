import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { cx } from "./cx.ts";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  /** Ícone à esquerda, dentro do campo (ex.: envelope no e-mail). */
  icon?: ReactNode;
  /** Ao lado do rótulo, à direita (ex.: "Esqueci minha senha"). */
  labelAside?: ReactNode;
  /** Dentro do campo, à direita (ex.: o botão de mostrar a senha). */
  trailing?: ReactNode;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Campo com rótulo ligado ao input; dica e erro anunciados ao leitor de tela. */
export function TextField({
  label,
  icon,
  labelAside,
  trailing,
  hint,
  error,
  className,
  ref,
  ...props
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
          {label}
        </label>
        {labelAside}
      </div>
      <div
        className={cx(
          // Como no protótipo: sombra leve parado e borda CTA de 1,5 px com o foco (borda de 1 px
          // mais meio pixel de anel). No alto contraste do Windows, sombras e anéis somem; o foco
          // continua visível pelo `outline-hidden` do campo, que nesse modo vira um contorno real.
          "group flex h-11 items-center gap-2.5 rounded-md border bg-paper pr-2 pl-3.5 shadow-field",
          "focus-within:border-cta focus-within:ring-[0.5px] focus-within:ring-cta",
          error ? "border-danger" : "border-line-strong",
        )}
      >
        {icon && (
          <span aria-hidden className="text-ink-3 group-focus-within:text-primary-text">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-hidden placeholder:text-ink-3"
          {...props}
        />
        {trailing}
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
