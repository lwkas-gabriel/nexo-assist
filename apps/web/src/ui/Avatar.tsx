import { cx } from "./cx.ts";
import { initialsOf } from "./initials.ts";

const SIZE_CLASSES = { sm: "size-7 text-[11px]", md: "size-9 text-[13px]" } as const;

export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZE_CLASSES }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-paper",
        SIZE_CLASSES[size],
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
