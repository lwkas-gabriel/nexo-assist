import { AVATAR_TONES, type AvatarTone } from "./avatar-tones.ts";
import { cx } from "./cx.ts";
import { initialsOf } from "./initials.ts";

/** Tamanhos do protótipo: 34 (sidebar e rail), 36, 40 e 46 px (lista do console). */
const SIZE_CLASSES = {
  sm: "size-[34px] text-[12px]",
  md: "size-9 text-[13px]",
  lg: "size-10 text-[14px]",
  xl: "size-[46px] text-[15px]",
} as const;

export function Avatar({
  name,
  size = "md",
  tone = "primary",
}: {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  tone?: AvatarTone;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_TONES[tone],
        SIZE_CLASSES[size],
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
