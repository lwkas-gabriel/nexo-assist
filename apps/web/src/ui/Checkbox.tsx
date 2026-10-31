import { Check } from "lucide-react";
import { useId, type InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  label: string;
};

/**
 * Checkbox do protótipo: 18 px, raio 6, azul do CTA quando marcado. Continua sendo um input
 * nativo (teclado, leitor de tela e formulário funcionam como sempre); só o desenho muda.
 */
export function Checkbox({ label, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-[9px]">
      <span className="relative inline-flex size-[18px] shrink-0">
        <input
          id={id}
          type="checkbox"
          className="peer size-[18px] cursor-pointer appearance-none rounded-sm border border-line-strong bg-paper checked:border-cta checked:bg-cta forced-colors:appearance-auto"
          {...props}
        />
        <Check
          aria-hidden
          size={12}
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto hidden text-paper peer-checked:block"
        />
      </span>
      <label htmlFor={id} className="cursor-pointer text-[13.5px] text-ink-2">
        {label}
      </label>
    </div>
  );
}
