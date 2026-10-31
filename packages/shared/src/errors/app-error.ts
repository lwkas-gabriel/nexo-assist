/**
 * Erros esperados da aplicação. Cada código vira um status HTTP num único lugar
 * (o middleware de erros de cada servidor) e o front traduz o código numa mensagem amigável.
 */
export const ERROR_HTTP_STATUS = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  /** RN14: a sessão chegou a 30 mensagens; o funcionário começa outra ou fala com um analista. */
  SESSION_LIMIT: 409,
  INTERNAL: 500,
  TICKETS_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export class AppError extends Error {
  override name = "AppError";
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  get httpStatus(): (typeof ERROR_HTTP_STATUS)[ErrorCode] {
    return ERROR_HTTP_STATUS[this.code];
  }
}

/** Corpo padrão de erro nas respostas HTTP: `{ error: { code, message } }`. */
export function errorBody(code: ErrorCode, message: string) {
  return { error: { code, message } };
}
