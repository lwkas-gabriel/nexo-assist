/** Relógio injetável: regras com tempo (limites, prazos) ficam testáveis com um relógio fixo. */
export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};
