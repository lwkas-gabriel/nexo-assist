import { errorBody } from "@nexo/shared/errors";
import { createMiddleware } from "hono/factory";

type FailureInjectionOptions = {
  /** Fração das requisições que falham (0 a 1), metade antes e metade depois de processar. */
  rate: number;
  /** Fonte de aleatoriedade; os testes passam uma sequência fixa. */
  random?: () => number;
};

const UNAVAILABLE = errorBody("TICKETS_UNAVAILABLE", "Sistema de chamados indisponível.");

/**
 * Simula o sistema legado que fica indisponível por alguns segundos (PRD), de dois jeitos:
 * - antes de processar: nada acontece e a resposta é 503;
 * - depois de processar: a operação foi gravada, mas a resposta "se perde" (503).
 * O segundo caso é o que exige idempotência de quem chama.
 */
export function injectFailures({ rate, random = Math.random }: FailureInjectionOptions) {
  return createMiddleware(async (c, next) => {
    const roll = random();

    if (roll < rate / 2) {
      return c.json(UNAVAILABLE, 503);
    }

    await next();

    if (roll < rate) {
      c.res = c.json(UNAVAILABLE, 503);
    }
    return undefined;
  });
}
