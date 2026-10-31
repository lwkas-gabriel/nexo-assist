/** Filtros da lista do console (tela 4): a api conta e filtra; a tela mostra. */
export const CONSOLE_FILTERS = ["all", "for_you", "with_agent", "mine"] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];
