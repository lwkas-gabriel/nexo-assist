import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Largura simulada da janela, para os testes de responsividade (10.6). O jsdom não implementa
 * matchMedia; aqui ele responde às media queries de largura mínima e avisa quem estiver ouvindo
 * quando `setViewportWidth` muda a largura, como o navegador faz ao redimensionar.
 */
const DEFAULT_WIDTH = 1440;
let viewportWidth = DEFAULT_WIDTH;
const listeners = new Map<string, Set<() => void>>();

function matchesQuery(query: string, width: number): boolean {
  const minWidth = /min-width:\s*(\d+)px/.exec(query)?.[1];
  return minWidth ? width >= Number(minWidth) : false;
}

export function setViewportWidth(width: number) {
  const before = viewportWidth;
  viewportWidth = width;
  for (const [query, callbacks] of listeners) {
    if (matchesQuery(query, before) !== matchesQuery(query, width)) {
      for (const callback of callbacks) callback();
    }
  }
}

// Só o que o useBreakpoint usa de MediaQueryList; o resto do tipo não faz falta aqui.
window.matchMedia = (query: string) =>
  ({
    get matches() {
      return matchesQuery(query, viewportWidth);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, callback: () => void) => {
      const callbacks = listeners.get(query) ?? new Set();
      callbacks.add(callback);
      listeners.set(query, callbacks);
    },
    removeEventListener: (_type: string, callback: () => void) => {
      listeners.get(query)?.delete(callback);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  viewportWidth = DEFAULT_WIDTH;
});
