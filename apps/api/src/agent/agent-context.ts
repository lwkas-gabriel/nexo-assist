import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@nexo/shared/errors";

/** Chave do funcionário no contexto do turno. O valor nunca vem do modelo nem do navegador. */
const EMPLOYEE_ID_KEY = "employeeId";

/**
 * Contexto do turno: o funcionário vem da sessão de login (RN09).
 * O contexto é o genérico do Mastra; quem lê confere o valor (employeeIdFrom), falhando fechado.
 */
export function createAgentRequestContext(employeeId: string): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set(EMPLOYEE_ID_KEY, employeeId);
  return requestContext;
}

/**
 * Dono dos dados que uma tool pode consultar. Falha fechada: sem funcionário no contexto,
 * a tool não consulta nada (em vez de consultar "sem dono").
 */
export function employeeIdFrom(context: { requestContext?: RequestContext } | undefined): string {
  const employeeId: unknown = context?.requestContext?.get(EMPLOYEE_ID_KEY);
  if (typeof employeeId !== "string" || employeeId.length === 0) {
    throw new AppError("UNAUTHORIZED", "Turno do agent sem funcionário identificado.");
  }
  return employeeId;
}
