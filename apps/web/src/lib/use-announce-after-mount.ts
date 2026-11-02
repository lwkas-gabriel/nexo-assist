import { useEffect, useState } from "react";

/**
 * Quanto esperar, depois de a tela montar, para pôr o texto numa região viva que já existe.
 * Pouco: o aviso não pode parecer atrasado; o suficiente para o leitor de tela já ter registrado
 * a região vazia.
 */
export const ANNOUNCE_AFTER_MOUNT_MS = 100;

/**
 * O texto de um aviso que já existe quando a tela abre (ex.: "Sua sessão expirou" no login).
 * Leitores de tela costumam ignorar uma região viva que já nasce com o texto, então a região monta
 * vazia (`null`) e o texto entra pouco depois.
 */
export function useAnnounceAfterMount(text: string | null): string | null {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), ANNOUNCE_AFTER_MOUNT_MS);
    return () => clearTimeout(timer);
  }, []);
  return isMounted ? text : null;
}
