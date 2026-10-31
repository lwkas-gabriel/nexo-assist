import { describe, expect, it } from "vitest";
import { providerQuotaDay } from "./quota-day.ts";

describe("dia da cota do provedor (ADR-0010)", () => {
  it("vira à meia-noite do Pacífico, não à meia-noite de Brasília nem em UTC", () => {
    // 31/10 às 23:59 no Pacífico (PDT, UTC-7) = 01/11 às 06:59 UTC.
    expect(providerQuotaDay(new Date("2026-11-01T06:59:00Z"))).toBe("2026-10-31");
    expect(providerQuotaDay(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11-01");
  });
});
