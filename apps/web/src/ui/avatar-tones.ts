/**
 * Cores de avatar do protótipo. O avatar de quem está logado usa o azul suave; na lista do
 * console, cada pessoa ganha um dos 7 pares pastel, sempre o mesmo para a mesma pessoa.
 */
export const AVATAR_TONES = {
  primary: "bg-primary-soft text-primary-text",
  blue: "bg-avatar-blue text-avatar-blue-text",
  orange: "bg-avatar-orange text-avatar-orange-text",
  violet: "bg-avatar-violet text-avatar-violet-text",
  green: "bg-avatar-green text-avatar-green-text",
  pink: "bg-avatar-pink text-avatar-pink-text",
  gray: "bg-avatar-gray text-avatar-gray-text",
  yellow: "bg-avatar-yellow text-avatar-yellow-text",
} as const;
export type AvatarTone = keyof typeof AVATAR_TONES;

const PALETTE: AvatarTone[] = ["blue", "orange", "violet", "green", "pink", "gray", "yellow"];

/** Tom fixo para uma pessoa, a partir do id: a mesma pessoa tem sempre a mesma cor. */
export function avatarToneFor(personId: string): AvatarTone {
  let hash = 0;
  for (const char of personId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? "blue";
}
