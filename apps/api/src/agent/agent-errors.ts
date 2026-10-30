import { APICallError, RetryError } from "ai";

export const QUOTA_EXCEEDED_MESSAGE =
  "O assistente atingiu o limite de uso do modelo de IA por enquanto. Tente de novo em alguns minutos.";
export const GENERIC_AGENT_ERROR_MESSAGE =
  "Não consegui responder agora. Tente novamente em instantes.";

const TOO_MANY_REQUESTS = 429;

/**
 * Mensagem que o funcionário vê quando o modelo falha.
 * Nunca repassa o erro original: ele traz detalhes internos (mensagem do provedor, stack trace,
 * caminhos de arquivo). O detalhe fica só no log do servidor.
 * No plano gratuito do Gemini, a cota por minuto/dia acaba (HTTP 429): isso é dito com clareza (ADR-0010).
 */
export function describeAgentError(error: unknown): string {
  // Depois de tentar de novo, o AI SDK embrulha o erro original num RetryError.
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause) && cause.statusCode === TOO_MANY_REQUESTS) {
    return QUOTA_EXCEEDED_MESSAGE;
  }
  return GENERIC_AGENT_ERROR_MESSAGE;
}
