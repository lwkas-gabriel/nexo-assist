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

export type QuerySnapshot<T> = Pick<
  UseQueryResult<T, Error>,
  "data" | "error" | "isPlaceholderData" | "isFetching" | "errorUpdatedAt"
>;

/**
 * Uma falha que esta tela viu acontecer: quando (o `errorUpdatedAt` da consulta) e o que dizer.
 * A biblioteca apaga o erro a cada nova tentativa, mas mantém o instante; a tela guarda o texto.
 */
export type SeenFailure = { at: number; message: string };

/** Só a mensagem da nossa api é feita para a tela; qualquer outro erro vira a frase genérica. */
export function messageOf(error: Error): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}

/**
 * Traduz o resultado da consulta. Dois detalhes do TanStack Query que a tela não pode adivinhar:
 * - uma consulta sem dados que falhou volta a "pendente" (com o erro apagado) a cada nova
 *   tentativa, e o `placeholderData` reaparece: sem a falha vista (`seen`), a lista do filtro
 *   anterior voltaria em silêncio entre uma falha e outra, e a tela piscaria o esqueleto. Só vale
 *   a falha que esta tela viu (mesmo `errorUpdatedAt`): uma consulta que falhou antes de a tela
 *   abrir, e ainda está no cache, não é erro de agora;
 * - com dados, uma falha vira `error` mas os dados ficam: isso é "desatualizada", não erro.
 */
export function queryViewOf<T>(
  query: QuerySnapshot<T>,
  seen: SeenFailure | null = null,
): QueryView<T> {
  const { data, error } = query;
  // A nova tentativa de uma falha vista: o erro já foi apagado, a mensagem vem do que a tela guardou.
  const retryMessage =
    error === null && seen !== null && seen.at === query.errorUpdatedAt ? seen.message : undefined;
  if (data === undefined) {
    if (error) return { status: "error", message: messageOf(error) };
    return retryMessage === undefined
      ? { status: "loading" }
      : { status: "error", message: retryMessage };
  }
  if (query.isPlaceholderData && retryMessage !== undefined) {
    return { status: "error", message: retryMessage };
  }
  return {
    status: "ready",
    data,
    isOutOfSync: error !== null,
    isSwitching: query.isPlaceholderData && query.isFetching,
  };
}
