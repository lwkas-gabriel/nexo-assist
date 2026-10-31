/**
 * Tecla de atalho conforme o sistema (R33): ⌘ no Mac, Ctrl no Windows e no Linux.
 * Recebe a plataforma para ser testável; na tela, use `isMacPlatform()`.
 */
export function modifierKeyLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

export function isMacPlatform(userAgent: string = navigator.userAgent): boolean {
  return /Mac|iPhone|iPad/.test(userAgent);
}
