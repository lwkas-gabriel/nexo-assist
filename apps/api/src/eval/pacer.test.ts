import { describe, expect, it } from "vitest";
import { createPacer } from "./pacer.ts";

/** Relógio e espera falsos: `sleep` avança o relógio, como a espera de verdade faria. */
function fakeTime(start = 0) {
  let current = start;
  const sleeps: number[] = [];
  return {
    nowMs: () => current,
    sleep: (ms: number) => {
      sleeps.push(ms);
      current += ms;
      return Promise.resolve();
    },
    pass: (ms: number) => {
      current += ms;
    },
    sleeps,
  };
}

describe("espaçamento das mensagens ao modelo (ADR-0010)", () => {
  it("a primeira mensagem sai sem esperar", async () => {
    const time = fakeTime();
    const pacer = createPacer({ minIntervalMs: 20_000, nowMs: time.nowMs, sleep: time.sleep });

    await pacer.waitForTurn();

    expect(time.sleeps).toEqual([]);
  });

  it("espera o que falta para completar o intervalo desde o início da mensagem anterior", async () => {
    const time = fakeTime();
    const pacer = createPacer({ minIntervalMs: 20_000, nowMs: time.nowMs, sleep: time.sleep });

    await pacer.waitForTurn();
    time.pass(5_000);
    await pacer.waitForTurn();

    expect(time.sleeps).toEqual([15_000]);
  });

  it("não espera quando a mensagem anterior já levou o intervalo todo", async () => {
    const time = fakeTime();
    const pacer = createPacer({ minIntervalMs: 20_000, nowMs: time.nowMs, sleep: time.sleep });

    await pacer.waitForTurn();
    time.pass(25_000);
    await pacer.waitForTurn();

    expect(time.sleeps).toEqual([]);
  });

  it("com intervalo zero (modelo falso) nunca espera", async () => {
    const time = fakeTime();
    const pacer = createPacer({ minIntervalMs: 0, nowMs: time.nowMs, sleep: time.sleep });

    await pacer.waitForTurn();
    await pacer.waitForTurn();
    await pacer.waitForTurn();

    expect(time.sleeps).toEqual([]);
  });
});
