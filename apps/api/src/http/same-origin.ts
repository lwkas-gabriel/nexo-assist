import { AppError } from "@nexo/shared/errors";
import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF: escritas vindas de outro site são recusadas.
 * Navegadores sempre enviam `Origin` em POST; se ele não for este mesmo endereço, a requisição
 * foi disparada por outra página. Junto com o cookie SameSite=Lax, isso fecha o ataque.
 * Sem `Origin` (curl, testes), não há navegador e, portanto, não há cookie de vítima.
 */
export function rejectCrossOriginWrites() {
  return createMiddleware(async (c, next) => {
    const origin = c.req.header("origin");
    if (!SAFE_METHODS.has(c.req.method) && origin && hostOf(origin) !== c.req.header("host")) {
      throw new AppError("FORBIDDEN", "Requisição de outra origem recusada.");
    }
    await next();
  });
}

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}
