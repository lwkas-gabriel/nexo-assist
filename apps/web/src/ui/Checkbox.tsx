import { useId, type InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  label: string;
};

export function Checkbox({ label, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="size-4 accent-cta" {...props} />
      <label htmlFor={id} className="text-[13px] text-ink-2">
        {label}
      </label>
    </div>
  );
}
