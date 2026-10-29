/** Erro vindo da api, com o código do servidor (ex.: UNAUTHORIZED) e uma mensagem em português. */
export class ApiError extends Error {
  override name = "ApiError";
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const GENERIC_MESSAGE = "Não foi possível falar com o servidor. Tente novamente em instantes.";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

/**
 * Única porta de saída do front para a api. Mesma origem: o cookie de sessão vai junto sozinho.
 * Respostas de erro (`{ error: { code, message } }`) viram ApiError.
 */
export async function apiRequest<T>(
  path: string,
  { method = "GET", body }: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError("NETWORK", GENERIC_MESSAGE, 0);
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw toApiError(payload, response.status);
  }
  return payload as T;
}

function toApiError(payload: unknown, status: number): ApiError {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
  const message = typeof error?.message === "string" ? error.message : GENERIC_MESSAGE;
  return new ApiError(code, message, status);
}
