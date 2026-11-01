import { APICallError, RetryError } from "ai";

/**
 * O que um erro do provedor do modelo quer dizer para a avaliação: cota esgotada e indisponibilidade
 * (5xx, tempo esgotado, sobrecarga) não dizem nada sobre a qualidade das decisões; qualquer outro
 * erro é do turno.
 */
export type ProviderFailureKind = "quota" | "unavailable" | "other";

const TOO_MANY_REQUESTS = 429;
const REQUEST_TIMEOUT = 408;
const FIRST_SERVER_ERROR = 500;
const UNAVAILABLE_MESSAGE =
  /timeout|timed out|overloaded|fetch failed|econnreset|etimedout|unavailable/i;

export function classifyProviderError(error: unknown): ProviderFailureKind {
  // Depois de tentar de novo, o AI SDK embrulha o erro original num RetryError.
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === TOO_MANY_REQUESTS) return "quota";
    const status = cause.statusCode ?? 0;
    if (status >= FIRST_SERVER_ERROR || status === REQUEST_TIMEOUT || cause.isRetryable) {
      return "unavailable";
    }
    return "other";
  }
  if (
    cause instanceof Error &&
    (UNAVAILABLE_MESSAGE.test(cause.message) || cause.name === "TimeoutError")
  ) {
    return "unavailable";
  }
  return "other";
}

/** Mensagens que o produto registra com console.error quando o modelo falha (o erro vem junto). */
export const AGENT_FAILURE_LOG = "Falha no turno do agent";
export const CLASSIFIER_FAILURE_LOG = "Classificador falhou; o turno segue só com o agent";

export type CapturedFailures = { agent: unknown; classifier: unknown };

/**
 * Roda `action` guardando os erros que o produto só registra no log (o stream devolve ao cliente
 * uma mensagem genérica, sem o código HTTP). Os dois registros conhecidos não vão para o terminal;
 * qualquer outro console.error segue normalmente.
 */
export async function captureProviderFailures<T>(
  action: () => Promise<T>,
): Promise<{ result: T; failures: CapturedFailures }> {
  const failures: CapturedFailures = { agent: undefined, classifier: undefined };
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (args[0] === AGENT_FAILURE_LOG) failures.agent = args[1];
    else if (args[0] === CLASSIFIER_FAILURE_LOG) failures.classifier = args[1];
    else original(...args);
  };
  try {
    return { result: await action(), failures };
  } finally {
    console.error = original;
  }
}
