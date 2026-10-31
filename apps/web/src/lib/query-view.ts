import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError, GENERIC_MESSAGE } from "./api-client.ts";

/**
 * O que uma consulta mostra na tela (10.5), em três estados que não se misturam: carregando, erro
 * ou pronta. "Pronta" pode estar desatualizada (o polling falhou, mas há dados) ou trocando (a
 * lista antiga fica até a nova chegar). Quem desenha não olha os booleanos do TanStack Query.
 */
export type QueryView<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: T;
      /** Uma atualização falhou: os dados na tela podem estar velhos. */
      isOutOfSync: boolean;
      /** Os dados são os da consulta anterior, até a nova chegar (ex.: troca de filtro). */
      isSwitching: boolean;
    };

type QuerySnapshot<T> = Pick<
  UseQueryResult<T, Error>,
  "data" | "error" | "isPlaceholderData" | "isFetching" | "errorUpdatedAt"
>;

/** Só a mensagem da nossa api é feita para a tela; qualquer outro erro vira a frase genérica. */
function messageOf(error: Error | null): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}

/**
 * Traduz o resultado da consulta. Dois detalhes do TanStack Query que a tela não pode adivinhar:
 * - uma consulta sem dados que falhou volta a "pendente" (com o erro apagado) a cada nova
 *   tentativa, e o `placeholderData` reaparece: sem a regra do `errorUpdatedAt`, a lista do filtro
 *   anterior voltaria em silêncio entre uma falha e outra;
 * - com dados, uma falha vira `error` mas os dados ficam: isso é "desatualizada", não erro.
 */
export function queryViewOf<T>(query: QuerySnapshot<T>): QueryView<T> {
  const { data, error } = query;
  if (data === undefined) {
    return error ? { status: "error", message: messageOf(error) } : { status: "loading" };
  }
  if (query.isPlaceholderData && query.errorUpdatedAt > 0) {
    return { status: "error", message: messageOf(error) };
  }
  return {
    status: "ready",
    data,
    isOutOfSync: error !== null,
    isSwitching: query.isPlaceholderData && query.isFetching,
  };
}
