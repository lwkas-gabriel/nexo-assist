import { AppError } from "@nexo/shared/errors";

/**
 * Falhas viram respostas que o agent explica ao funcionário, em vez de quebrar o turno.
 * "Não encontrado" cobre também o que é de outra pessoa, sem revelar que existe (RN09).
 * Recusas de regra (CONFLICT, INVALID_REQUEST) levam a nossa mensagem, escrita para o agent.
 * Qualquer outra falha vira "tickets_error": o detalhe fica só no log do servidor.
 */
export function toolFailure(error: unknown) {
  if (error instanceof AppError) {
    switch (error.code) {
      case "TICKETS_UNAVAILABLE":
        return { ok: false as const, reason: "tickets_unavailable" as const };
      case "NOT_FOUND":
        return { ok: false as const, reason: "not_found" as const };
      case "CONFLICT":
      case "INVALID_REQUEST":
        return { ok: false as const, reason: "refused" as const, detail: error.message };
    }
  }
  console.error("Falha inesperada numa tool do agent", error);
  return { ok: false as const, reason: "tickets_error" as const };
}
