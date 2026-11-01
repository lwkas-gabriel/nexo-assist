import { useState } from "react";
import {
  messageOf,
  queryViewOf,
  type QuerySnapshot,
  type QueryView,
  type SeenFailure,
} from "./query-view.ts";

type QueryScreen<T> = {
  view: QueryView<T>;
  /** "Tentar novamente": refaz a consulta. Ignorado enquanto uma nova tentativa manual corre. */
  retry: () => void;
  /**
   * Só a nova tentativa pedida pela pessoa. O polling refaz a consulta sozinho, o tempo todo, e
   * isso não pode desabilitar o botão nem trocar o texto do alerta (10.5, 10.7).
   */
  isRetrying: boolean;
};

/**
 * Liga uma consulta à tela (10.5): o estado que ela mostra (`queryViewOf`), lembrando a falha que
 * esta tela viu, e o "Tentar novamente" manual.
 */
export function useQueryView<T>(
  query: QuerySnapshot<T> & { refetch: () => Promise<unknown> },
): QueryScreen<T> {
  const [seen, setSeen] = useState<SeenFailure | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Ajuste durante a renderização (padrão do React para estado derivado): lembra cada falha nova.
  if (query.error && seen?.at !== query.errorUpdatedAt) {
    setSeen({ at: query.errorUpdatedAt, message: messageOf(query.error) });
  }

  function retry() {
    if (isRetrying) return;
    setIsRetrying(true);
    // `refetch` não rejeita: a falha vira o erro da consulta. Assentou, a tentativa terminou.
    void query.refetch().finally(() => setIsRetrying(false));
  }

  return { view: queryViewOf(query, seen), retry, isRetrying };
}
