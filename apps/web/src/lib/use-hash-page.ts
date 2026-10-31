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

/**
 * Tira o hash da URL sem criar entrada no histórico. Ao sair, a próxima pessoa a entrar não pode
 * cair direto no perfil de quem saiu (nem o analista ficar com "#/perfil" na URL do console).
 */
export function clearPageHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function useHashPage(): EmployeePage {
  return useSyncExternalStore(subscribe, () => pageFromHash(window.location.hash));
}
