import { useSyncExternalStore } from "react";

/** As quatro faixas de largura de 10.6 (mesmos limites dos breakpoints do tema). */
export type Breakpoint = "mobile" | "tablet" | "laptop" | "desktop";

const QUERIES: [Breakpoint, string][] = [
  ["desktop", "(min-width: 1280px)"],
  ["laptop", "(min-width: 1024px)"],
  ["tablet", "(min-width: 768px)"],
];

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
