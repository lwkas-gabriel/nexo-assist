import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@nexo/shared/errors";
import { createMiddleware } from "hono/factory";

/**
 * Só a api pode chamar este serviço: exige `Authorization: Bearer <token>`.
 * Compara os hashes em tempo constante, para o tempo de resposta não revelar o token.
 */
export function requireServiceToken(expectedToken: string) {
  const expectedDigest = sha256(expectedToken);

  return createMiddleware(async (c, next) => {
    const provided = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!timingSafeEqual(sha256(provided), expectedDigest)) {
      throw new AppError("UNAUTHORIZED", "Token de serviço inválido.");
    }
    await next();
  });
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
