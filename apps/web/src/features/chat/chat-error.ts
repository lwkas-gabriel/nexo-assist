export const GENERIC_CHAT_ERROR = "Não consegui responder agora. Tente novamente em instantes.";

/**
 * Texto para o funcionário quando o envio ou a resposta falha.
 * - Erro HTTP da api (limite de mensagens, "aguarde"): o corpo é `{ error: { message } }` em JSON.
 * - Erro no meio da resposta: o servidor já manda um texto amigável (cota do modelo, falha genérica).
 * - Qualquer outra coisa (rede fora, resposta inesperada): mensagem genérica.
 */
export function describeChatError(error: Error): string {
  const fromApi = messageFromErrorBody(error.message);
  if (fromApi) return fromApi;
  return isFriendlyServerText(error.message) ? error.message : GENERIC_CHAT_ERROR;
}

function messageFromErrorBody(text: string): string | undefined {
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown } };
    return typeof body.error?.message === "string" ? body.error.message : undefined;
  } catch {
    return undefined;
  }
}

/** Textos do nosso servidor são frases em português; mensagens técnicas do navegador não. */
function isFriendlyServerText(text: string): boolean {
  return /^(O assistente|Não consegui)/.test(text);
}
