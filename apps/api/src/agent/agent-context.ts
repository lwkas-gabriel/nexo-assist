import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@nexo/shared/errors";

/** O que o servidor entrega às tools em cada turno. Nunca vem do modelo nem do navegador. */
type AgentRequestContextValues = {
  employeeId: string;
};

/** Contexto do turno: o funcionário vem da sessão de login (RN09). */
export function createAgentRequestContext(
  employeeId: string,
): RequestContext<AgentRequestContextValues> {
  const requestContext = new RequestContext<AgentRequestContextValues>();
  requestContext.set("employeeId", employeeId);
  return requestContext;
}

/**
 * Dono dos dados que uma tool pode consultar. Falha fechada: sem funcionário no contexto,
 * a tool não consulta nada (em vez de consultar "sem dono").
 */
export function employeeIdFrom(context: { requestContext?: RequestContext } | undefined): string {
  const employeeId: unknown = context?.requestContext?.get("employeeId");
  if (typeof employeeId !== "string" || employeeId.length === 0) {
    throw new AppError("UNAUTHORIZED", "Turno do agent sem funcionário identificado.");
  }
  return employeeId;
}
