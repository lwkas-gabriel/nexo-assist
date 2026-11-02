import type { Clock } from "@nexo/shared/domain";

/** Relógio da avaliação. */
export type SteppingClock = Clock & {
  /** Pula o tempo, como o funcionário que demora a escrever a próxima mensagem. */
  advance(ms: number): void;
};

const DEFAULT_STEP_MS = 1;

/**
 * Relógio determinístico: parte de um instante fixo e avança alguns milissegundos a cada leitura.
 * Um relógio parado daria o mesmo horário às mensagens de um turno, e a ordem delas (e a regra
 * "o rascunho existia antes do turno", R04) dependeria de desempate. Avançar só ao ser lido
 * mantém a execução idêntica de uma rodada para outra, sem depender do relógio real.
 */
export function createSteppingClock(start: Date, stepMs: number = DEFAULT_STEP_MS): SteppingClock {
  let current = start.getTime();
  return {
    now() {
      const value = new Date(current);
      current += stepMs;
      return value;
    },
    advance(ms) {
      current += ms;
    },
  };
}
