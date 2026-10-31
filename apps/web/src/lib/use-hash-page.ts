import { useSyncExternalStore } from "react";

/**
 * As páginas do funcionário (10.3): o atendimento e "Meu perfil". Navegação por hash ("#/perfil"):
 * o voltar e o avançar do navegador funcionam, sem rota nova no servidor.
 */
export type EmployeePage = "chat" | "profile";

export const PAGE_HREFS: Record<EmployeePage, string> = {
  chat: "#/",
  profile: "#/perfil",
};

function pageFromHash(hash: string): EmployeePage {
  return hash === PAGE_HREFS.profile ? "profile" : "chat";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useHashPage(): EmployeePage {
  return useSyncExternalStore(subscribe, () => pageFromHash(window.location.hash));
}
