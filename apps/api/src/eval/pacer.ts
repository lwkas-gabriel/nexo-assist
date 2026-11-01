/**
 * Espaça as mensagens enviadas ao modelo real para respeitar a cota por minuto do plano gratuito
 * (ADR-0010). O relógio e a espera são injetados: os testes não esperam de verdade.
 */
export type Pacer = {
  /** Espera, se preciso, até que possa começar uma nova mensagem. */
  waitForTurn(): Promise<void>;
};

export function createPacer({
  minIntervalMs,
  nowMs,
  sleep,
}: {
  minIntervalMs: number;
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
}): Pacer {
  let lastStartMs: number | undefined;
  return {
    async waitForTurn() {
      if (lastStartMs !== undefined) {
        const remaining = lastStartMs + minIntervalMs - nowMs();
        if (remaining > 0) await sleep(remaining);
      }
      lastStartMs = nowMs();
    },
  };
}
