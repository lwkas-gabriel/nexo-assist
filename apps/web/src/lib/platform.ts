/**
 * Tecla de atalho conforme o sistema (R33): ⌘ no Mac, Ctrl no Windows e no Linux.
 * Recebe a plataforma para ser testável; na tela, use `isMacPlatform()`.
 */
export function modifierKeyLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

/** Valor de `aria-keyshortcuts` para o mesmo atalho com Enter. */
export function modifierEnterShortcut(isMac: boolean): string {
  return isMac ? "Meta+Enter" : "Control+Enter";
}

export function isMacPlatform(userAgent: string = navigator.userAgent): boolean {
  return /Mac|iPhone|iPad/.test(userAgent);
}
