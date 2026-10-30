import { describe, expect, it } from "vitest";
import { formatBrasiliaDateTime, wholeDaysSince } from "./date-format.ts";

describe("formatBrasiliaDateTime", () => {
  it("mostra no horário de Brasília, mesmo com a data em UTC (R02)", () => {
    // 17:20 UTC = 14:20 em Brasília
    expect(formatBrasiliaDateTime(new Date("2026-10-16T17:20:00Z"))).toBe("16/10, 14:20");
  });

  it("vira o dia corretamente perto da meia-noite", () => {
    // 02:00 UTC do dia 17 = 23:00 do dia 16 em Brasília
    expect(formatBrasiliaDateTime(new Date("2026-10-17T02:00:00Z"))).toBe("16/10, 23:00");
  });
});

describe("wholeDaysSince", () => {
  it("conta dias inteiros desde a data", () => {
    const now = new Date("2026-10-27T15:00:00Z");

    expect(wholeDaysSince(new Date("2026-10-22T14:20:00Z"), now)).toBe(5);
  });

  it("nunca devolve número negativo", () => {
    const now = new Date("2026-10-27T15:00:00Z");

    expect(wholeDaysSince(new Date("2026-10-28T00:00:00Z"), now)).toBe(0);
  });
});
