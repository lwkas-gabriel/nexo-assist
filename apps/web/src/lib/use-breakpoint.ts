import { useSyncExternalStore } from "react";

/** As quatro faixas de largura de 10.6 (mesmos limites dos breakpoints do tema). */
export type Breakpoint = "mobile" | "tablet" | "laptop" | "desktop";

/** Largura mínima de cada faixa; iguais aos `--breakpoint-*` de tokens.css (um teste confere). */
export const BREAKPOINT_MIN_WIDTHS = { tablet: 768, laptop: 1024, desktop: 1280 } as const;

const QUERIES: [Breakpoint, string][] = (["desktop", "laptop", "tablet"] as const).map(
  (breakpoint) => [breakpoint, `(min-width: ${BREAKPOINT_MIN_WIDTHS[breakpoint]}px)`],
);

export function currentBreakpoint(matches: (query: string) => boolean): Breakpoint {
  return QUERIES.find(([, query]) => matches(query))?.[0] ?? "mobile";
}

function subscribe(onChange: () => void) {
  const lists = QUERIES.map(([, query]) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/** Faixa de largura atual; muda junto com a janela. */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, () =>
    currentBreakpoint((query) => window.matchMedia(query).matches),
  );
}
