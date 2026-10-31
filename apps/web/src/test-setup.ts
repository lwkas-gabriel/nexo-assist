import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Largura simulada da janela, para os testes de responsividade (10.6). O jsdom não implementa
 * matchMedia; aqui ele responde às media queries de largura mínima conforme `setViewportWidth`.
 */
let viewportWidth = 1440;

export function setViewportWidth(width: number) {
  viewportWidth = width;
}

window.matchMedia = (query: string) => {
  const minWidth = /min-width:\s*(\d+)px/.exec(query)?.[1];
  return {
    matches: minWidth ? viewportWidth >= Number(minWidth) : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
};

afterEach(() => {
  cleanup();
  setViewportWidth(1440);
});
