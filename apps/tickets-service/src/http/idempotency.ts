import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Database } from "../db/database.ts";
import { idempotencyKeys } from "../db/schema.ts";

export const IDEMPOTENCY_HEADER = "idempotency-key";
const MAX_KEY_LENGTH = 200;

/**
 * Toda escrita exige `Idempotency-Key` (achado R01). Se a mesma chave chegar de novo, devolve a
 * resposta guardada em vez de repetir a operação: um retry depois de uma resposta perdida
 * não cria um chamado duplicado.
 */
export function requireIdempotency({ db, clock }: { db: Database; clock: Clock }) {
  return createMiddleware(async (c, next) => {
    if (c.req.method !== "POST") {
      await next();
      return undefined;
    }

    const key = c.req.header(IDEMPOTENCY_HEADER)?.trim();
    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new AppError("INVALID_REQUEST", "Escritas exigem o cabeçalho Idempotency-Key.");
    }

    const stored = await db.query.idempotencyKeys.findFirst({
      where: eq(idempotencyKeys.key, key),
    });
    if (stored) {
      if (stored.method !== c.req.method || stored.path !== c.req.path) {
        throw new AppError(
          "CONFLICT",
          "Esta chave de idempotência já foi usada em outra operação.",
        );
      }
      return c.json(JSON.parse(stored.body) as unknown, stored.status as ContentfulStatusCode);
    }

    await next();

    // Guarda só respostas definitivas: um erro do servidor pode ser tentado de novo.
    if (c.res.status < 500) {
      await db.insert(idempotencyKeys).values({
        key,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        body: await c.res.clone().text(),
        createdAt: clock.now(),
      });
    }
    return undefined;
  });
}
