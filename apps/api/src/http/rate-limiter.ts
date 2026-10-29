import type { Clock } from "@nexo/shared/domain";

type Window = { startedAt: number; count: number };

type RateLimiterOptions = {
  /** Quantas requisições cabem em cada janela, por chave. */
  limit: number;
  windowMs: number;
  clock: Clock;
};

/** Acima disso, as janelas expiradas são descartadas para a memória não crescer sem limite. */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Limite por janela fixa: cada chave (um IP, ou "global") pode fazer `limit` requisições
 * a cada `windowMs`. Em memória: suficiente para uma instância só (ver ADR-0003).
 */
export function createRateLimiter({ limit, windowMs, clock }: RateLimiterOptions) {
  const windows = new Map<string, Window>();

  function discardExpired(now: number) {
    for (const [key, window] of windows) {
      if (now - window.startedAt >= windowMs) windows.delete(key);
    }
  }

  return {
    /** Registra uma requisição e diz se ela ainda cabe no limite. */
    tryConsume(key: string): boolean {
      const now = clock.now().getTime();
      if (windows.size >= MAX_TRACKED_KEYS) discardExpired(now);

      const current = windows.get(key);
      if (!current || now - current.startedAt >= windowMs) {
        windows.set(key, { startedAt: now, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;

      current.count += 1;
      return true;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
