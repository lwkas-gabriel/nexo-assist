import { describe, expect, it } from "vitest";
import { describeElapsed, formatBrasiliaDateTime } from "./date-format.ts";

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

describe("describeElapsed", () => {
  const now = new Date("2026-10-27T15:00:00Z");
  const before = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  it("conta em dias a partir de um dia inteiro", () => {
    expect(describeElapsed(before(5 * 24 + 1), now)).toBe("5 dias");
    expect(describeElapsed(before(24), now)).toBe("1 dia");
  });

  it("abaixo de um dia conta em horas: prazos de Crítica e Alta vencem antes disso", () => {
    expect(describeElapsed(before(2), now)).toBe("2 horas");
    expect(describeElapsed(before(1), now)).toBe("1 hora");
  });

  it("menos de uma hora não vira '0 horas'", () => {
    expect(describeElapsed(before(0.5), now)).toBe("menos de 1 hora");
  });

  it("data no futuro (relógios dessincronizados) não vira tempo negativo", () => {
    expect(describeElapsed(before(-3), now)).toBe("menos de 1 hora");
  });
});
