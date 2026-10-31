import { listTicketsResponseSchema, ticketSchema } from "@nexo/shared/contracts";
import { AppError } from "@nexo/shared/errors";
import { z } from "zod";
import type { TicketGateway } from "../ports/ticket-gateway.ts";

type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

type HttpTicketGatewayOptions = {
  baseUrl: string;
  serviceToken: string;
  /** Injetáveis para os testes; em produção, o fetch global, um relógio real e Math.random. */
  fetch?: FetchFunction;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  maxAttempts?: number;
};

/** Política de resiliência com o legado instável (RT05). */
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 200;
const BACKOFF_JITTER_MS = 100;

const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cliente HTTP do serviço de chamados com timeout e retry.
 * Tenta de novo só o que pode dar certo na próxima vez (rede, timeout, 5xx); escritas reusam
 * a mesma chave de idempotência em todas as tentativas, então nunca duplicam (R01).
 */
export function createHttpTicketGateway({
  baseUrl,
  serviceToken,
  fetch: fetchFunction = (url, init) => fetch(url, init),
  sleep = defaultSleep,
  random = Math.random,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: HttpTicketGatewayOptions): TicketGateway {
  async function request<Schema extends z.ZodType>(
    schema: Schema,
    method: "GET" | "POST",
    path: string,
    { body, idempotencyKey }: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<z.infer<Schema>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${serviceToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetchFunction(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      }).catch(() => undefined); // rede fora ou tempo esgotado: vale tentar de novo

      if (response && response.status < 500) {
        return parseResponse(schema, response);
      }
      if (attempt < maxAttempts) {
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1) + random() * BACKOFF_JITTER_MS);
      }
    }

    throw new AppError(
      "TICKETS_UNAVAILABLE",
      `O sistema de chamados está instável no momento (${maxAttempts} tentativas sem resposta).`,
    );
  }

  const ownerQuery = (ownerId: string) => `ownerId=${encodeURIComponent(ownerId)}`;
  const ticketPath = (number: string) => `/tickets/${encodeURIComponent(number)}`;

  return {
    async listTickets(ownerId, filter) {
      const result = await request(
        listTicketsResponseSchema,
        "GET",
        `/tickets?${ownerQuery(ownerId)}&filter=${filter}`,
      );
      return result.tickets;
    },
    getTicket: (ownerId, number) =>
      request(ticketSchema, "GET", `${ticketPath(number)}?${ownerQuery(ownerId)}`),
    createTicket: (ownerId, draft, idempotencyKey) =>
      request(ticketSchema, "POST", "/tickets", { body: { ownerId, draft }, idempotencyKey }),
    addUpdate: (ownerId, number, update, idempotencyKey) =>
      request(ticketSchema, "POST", `${ticketPath(number)}/updates`, {
        body: { ownerId, ...update },
        idempotencyKey,
      }),
    reopenTicket: (ownerId, number, idempotencyKey) =>
      request(ticketSchema, "POST", `${ticketPath(number)}/reopen`, {
        body: { ownerId },
        idempotencyKey,
      }),
    transferTicket: (ownerId, number, summary, idempotencyKey) =>
      request(ticketSchema, "POST", `${ticketPath(number)}/transfer`, {
        body: { ownerId, summary },
        idempotencyKey,
      }),
    assumeTicket: (ownerId, number, analystName, idempotencyKey) =>
      request(ticketSchema, "POST", `${ticketPath(number)}/assume`, {
        body: { ownerId, analystName },
        idempotencyKey,
      }),
  };
}

/**
 * Resposta 2xx: valida contra o contrato. 404 e 409 são respostas de negócio (o agent explica
 * ao funcionário). Qualquer outro 4xx é erro nosso (token, formato) e não deve vazar detalhes.
 */
async function parseResponse<Schema extends z.ZodType>(
  schema: Schema,
  response: Response,
): Promise<z.infer<Schema>> {
  const payload: unknown = await response.json().catch(() => undefined);

  if (response.ok) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError("INTERNAL", "Resposta inesperada do sistema de chamados.");
    }
    return parsed.data;
  }

  const message =
    errorResponseSchema.safeParse(payload).data?.error.message ?? "Erro no sistema de chamados.";
  if (response.status === 404) throw new AppError("NOT_FOUND", message);
  if (response.status === 409) throw new AppError("CONFLICT", message);

  console.error(`Sistema de chamados recusou a requisição (HTTP ${response.status})`);
  throw new AppError("INTERNAL", "Falha ao falar com o sistema de chamados.");
}
