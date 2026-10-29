import { describe, expect, it } from "vitest";
import type { Clock } from "@nexo/shared/domain";
import { createRateLimiter } from "./rate-limiter.ts";

function createFakeClock(start = 0) {
  let current = start;
  const clock: Clock = { now: () => new Date(current) };
  return { clock, advance: (ms: number) => (current += ms) };
}

describe("createRateLimiter", () => {
  it("aceita até o limite e recusa a seguinte na mesma janela", () => {
    const { clock } = createFakeClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock });

    expect(limiter.tryConsume("ip-1")).toBe(true);
    expect(limiter.tryConsume("ip-1")).toBe(true);
    expect(limiter.tryConsume("ip-1")).toBe(false);
  });

  it("libera de novo quando a janela termina", () => {
    const { clock, advance } = createFakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, clock });
    limiter.tryConsume("ip-1");

    advance(1000);

    expect(limiter.tryConsume("ip-1")).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    const { clock } = createFakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, clock });
    limiter.tryConsume("ip-1");

    expect(limiter.tryConsume("ip-2")).toBe(true);
  });
});
