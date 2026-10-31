/** Junta classes, descartando as vazias: `cx("a", isOpen && "b")`. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
