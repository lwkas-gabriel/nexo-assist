import { createHash } from "node:crypto";
import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import { and, eq, lt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Database } from "../db/database.ts";
import { idempotencyKeys } from "../db/schema.ts";

export const IDEMPOTENCY_HEADER = "idempotency-key";
const MAX_KEY_LENGTH = 200;

/** Status gravado enquanto a escrita da chave ainda está em andamento. */
const IN_PROGRESS = 0;

/**
 * Reserva abandonada (o processo caiu no meio da escrita) pode ser retomada depois deste tempo,
 * bem maior que o timeout com que a api espera cada tentativa.
 */
const STALE_RESERVATION_MS = 60 * 1000;

function hashRequest(method: string, path: string, body: string): string {
  return createHash("sha256").update(`${method} ${path}\n${body}`).digest("hex");
}

/**
 * Toda escrita exige `Idempotency-Key` (achado R01). Se a mesma chave chegar de novo, devolve a
 * resposta guardada em vez de repetir a operação: um retry depois de uma resposta perdida
 * não cria um chamado duplicado.
 *
 * A chave é reservada antes de executar, num INSERT atômico: de duas requisições simultâneas com
 * a mesma chave, só uma executa; a outra recebe 503 e, no retry, a resposta guardada.
 * A mesma chave com outro conteúdo é recusada (409), em vez de devolver o resultado de outra escrita.
 */
export function requireIdempotency({ db, clock }: { db: Database; clock: Clock }) {
  async function reserve(key: string, method: string, path: string, requestHash: string) {
    const now = clock.now();
    // Uma reserva abandonada há muito tempo deixa de valer; a nova requisição a assume.
    await db
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.status, IN_PROGRESS),
          lt(idempotencyKeys.createdAt, new Date(now.getTime() - STALE_RESERVATION_MS)),
        ),
      );
    const reserved = await db
      .insert(idempotencyKeys)
      .values({ key, method, path, requestHash, status: IN_PROGRESS, body: "", createdAt: now })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });
    return reserved.length > 0;
  }

  return createMiddleware(async (c, next) => {
    if (c.req.method !== "POST") {
      await next();
      return undefined;
    }

    const key = c.req.header(IDEMPOTENCY_HEADER)?.trim();
    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new AppError("INVALID_REQUEST", "Escritas exigem o cabeçalho Idempotency-Key.");
    }
    const { method, path } = c.req;
    const requestHash = hashRequest(method, path, await c.req.text());

    if (!(await reserve(key, method, path, requestHash))) {
      const stored = await db.query.idempotencyKeys.findFirst({
        where: eq(idempotencyKeys.key, key),
      });
      // Chaves antigas, de antes do hash, só conferem operação e caminho.
      const sameRequest = stored?.requestHash
        ? stored.requestHash === requestHash
        : stored?.method === method && stored.path === path;
      if (!stored || !sameRequest) {
        throw new AppError(
          "CONFLICT",
          "Esta chave de idempotência já foi usada em outra operação.",
        );
      }
      if (stored.status === IN_PROGRESS) {
        // Não é falha do pedido: a mesma escrita ainda está terminando. O retry da api pega o resultado.
        throw new AppError("TICKETS_UNAVAILABLE", "A mesma operação ainda está em andamento.");
      }
      return c.json(JSON.parse(stored.body) as unknown, stored.status as ContentfulStatusCode);
    }

    try {
      await next();
    } finally {
      // Guarda só respostas definitivas; um erro do servidor libera a chave para nova tentativa.
      if (c.res.status < 500) {
        await db
          .update(idempotencyKeys)
          .set({ status: c.res.status, body: await c.res.clone().text() })
          .where(eq(idempotencyKeys.key, key));
      } else {
        await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      }
    }
    return undefined;
  });
}
