import { useState } from "react";
import {
  messageOf,
  queryViewOf,
  type QuerySnapshot,
  type QueryView,
  type SeenFailure,
} from "./query-view.ts";

/**
 * Liga uma consulta à tela (10.5): o estado que ela mostra (`queryViewOf`), lembrando a falha que
 * esta tela viu acontecer. A biblioteca apaga o erro a cada nova tentativa, e a tela precisa dele
 * para seguir no erro e com a mesma mensagem, sem tomar por erro de agora uma falha antiga que
 * ainda está no cache.
 */
export function useQueryView<T>(query: QuerySnapshot<T>): QueryView<T> {
  const [seen, setSeen] = useState<SeenFailure | null>(null);

  // Ajuste durante a renderização (padrão do React para estado derivado): lembra cada falha nova.
  if (query.error && seen?.at !== query.errorUpdatedAt) {
    setSeen({ at: query.errorUpdatedAt, message: messageOf(query.error) });
  }

  return queryViewOf(query, seen);
}
