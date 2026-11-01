import { describe, expect, it } from "vitest";
import { createSteppingClock } from "./stepping-clock.ts";

const START = new Date("2026-10-27T18:00:00Z");

describe("relógio da avaliação", () => {
  it("começa no instante dado e avança um passo a cada leitura, sem usar o relógio real", () => {
    const clock = createSteppingClock(START, 5);

    expect(clock.now().toISOString()).toBe("2026-10-27T18:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-27T18:00:00.005Z");
    expect(clock.now().toISOString()).toBe("2026-10-27T18:00:00.010Z");
  });

  it("R04: duas leituras nunca dão o mesmo instante (a ordem das mensagens não depende de desempate)", () => {
    const clock = createSteppingClock(START);

    const first = clock.now().getTime();
    const second = clock.now().getTime();

    expect(second).toBeGreaterThan(first);
  });

  it("advance pula o tempo, como o funcionário que demora a escrever", () => {
    const clock = createSteppingClock(START, 1);
    clock.now();

    clock.advance(60_000);

    expect(clock.now().toISOString()).toBe("2026-10-27T18:01:00.001Z");
  });

  it("duas execuções partindo do mesmo instante dão a mesma sequência (determinismo)", () => {
    const sequence = () => {
      const clock = createSteppingClock(START);
      return [clock.now(), clock.now(), clock.now()].map((date) => date.toISOString());
    };

    expect(sequence()).toEqual(sequence());
  });
});
