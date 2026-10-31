import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@nexo/shared/errors";

/** Chaves do turno no contexto. Os valores nunca vêm do modelo nem do navegador. */
const EMPLOYEE_ID_KEY = "employeeId";
const CONVERSATION_ID_KEY = "conversationId";
const TURN_STARTED_AT_KEY = "turnStartedAt";

/**
 * Um turno do agent: quem está conversando (da sessão de login, RN09), em qual conversa e quando
 * a mensagem do funcionário chegou. O início do turno separa o que ele já viu do que o agent
 * acabou de propor (R04).
 */
export type AgentTurn = {
  employeeId: string;
  conversationId: string;
  startedAt: Date;
};

/** O contexto é o genérico do Mastra; quem lê confere os valores, falhando fechado. */
export function createAgentRequestContext(turn: AgentTurn): RequestContext {
  const requestContext = new RequestContext();
  requestContext.set(EMPLOYEE_ID_KEY, turn.employeeId);
  requestContext.set(CONVERSATION_ID_KEY, turn.conversationId);
  requestContext.set(TURN_STARTED_AT_KEY, turn.startedAt);
  return requestContext;
}

type ToolContext = { requestContext?: RequestContext } | undefined;

function requiredText(context: ToolContext, key: string): string {
  const value: unknown = context?.requestContext?.get(key);
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("UNAUTHORIZED", "Turno do agent sem funcionário identificado.");
  }
  return value;
}

/**
 * Dono dos dados que uma tool pode consultar. Falha fechada: sem funcionário no contexto,
 * a tool não consulta nada (em vez de consultar "sem dono").
 */
export function employeeIdFrom(context: ToolContext): string {
  return requiredText(context, EMPLOYEE_ID_KEY);
}

/** O turno completo, para as tools que gravam algo na conversa. Também falha fechada. */
export function agentTurnFrom(context: ToolContext): AgentTurn {
  const startedAt: unknown = context?.requestContext?.get(TURN_STARTED_AT_KEY);
  if (!(startedAt instanceof Date)) {
    throw new AppError("UNAUTHORIZED", "Turno do agent sem horário de início.");
  }
  return {
    employeeId: employeeIdFrom(context),
    conversationId: requiredText(context, CONVERSATION_ID_KEY),
    startedAt,
  };
}
