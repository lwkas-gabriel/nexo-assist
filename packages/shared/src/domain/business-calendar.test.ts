import { describe, expect, it } from "vitest";
import { NEXO_BUSINESS_CALENDAR, createBusinessCalendar } from "./business-calendar.ts";

/** Horário de Brasília (UTC-3) escrito por extenso, para os casos ficarem legíveis. */
function brasilia(dateTime: string): Date {
  return new Date(`${dateTime}-03:00`);
}

const FOUR_HOURS = 4 * 60;

describe("calendário útil da Nexo (RN13: seg–sex, 8h–18h, Brasília)", () => {
  const add = (start: string, minutes: number) =>
    NEXO_BUSINESS_CALENDAR.addBusinessMinutes(brasilia(start), minutes).toISOString();

  it("dentro do expediente, só soma as horas", () => {
    // terça 10h + 4h úteis
    expect(add("2026-10-20T10:00", FOUR_HOURS)).toBe(brasilia("2026-10-20T14:00").toISOString());
  });

  it("o que não cabe no dia continua na abertura do dia seguinte", () => {
    // terça 17h: 1h na terça + 3h na quarta → quarta 11h
    expect(add("2026-10-20T17:00", FOUR_HOURS)).toBe(brasilia("2026-10-21T11:00").toISOString());
  });

  it("sexta à tarde continua na segunda", () => {
    // sexta 16h: 2h na sexta + 2h na segunda → segunda 10h
    expect(add("2026-10-23T16:00", FOUR_HOURS)).toBe(brasilia("2026-10-26T10:00").toISOString());
  });

  it("aberto no fim de semana, começa a contar na segunda às 8h", () => {
    expect(add("2026-10-24T10:00", FOUR_HOURS)).toBe(brasilia("2026-10-26T12:00").toISOString());
  });

  it("aberto de madrugada, começa a contar às 8h do mesmo dia", () => {
    expect(add("2026-10-20T06:00", FOUR_HOURS)).toBe(brasilia("2026-10-20T12:00").toISOString());
  });

  it("aberto depois das 18h, começa a contar às 8h do dia seguinte", () => {
    expect(add("2026-10-20T20:00", FOUR_HOURS)).toBe(brasilia("2026-10-21T12:00").toISOString());
  });

  it("pode terminar exatamente no fechamento", () => {
    expect(add("2026-10-20T14:00", FOUR_HOURS)).toBe(brasilia("2026-10-20T18:00").toISOString());
  });

  it("um dia útil tem 10 horas", () => {
    expect(NEXO_BUSINESS_CALENDAR.businessDayMinutes).toBe(600);
  });

  it("R02: o resultado não depende do fuso do servidor (instante em UTC)", () => {
    // terça 17h em Brasília = 20h UTC; o prazo de 4h úteis é quarta 11h Brasília = 14h UTC
    const deadline = NEXO_BUSINESS_CALENDAR.addBusinessMinutes(
      new Date("2026-10-20T20:00:00Z"),
      FOUR_HOURS,
    );

    expect(deadline.toISOString()).toBe("2026-10-21T14:00:00.000Z");
  });
});

describe("virada de horário de verão (fuso de exemplo com DST)", () => {
  // O Brasil não tem horário de verão hoje; o código não pode depender disso.
  const newYork = createBusinessCalendar({
    timeZone: "America/New_York",
    openingHour: 8,
    closingHour: 18,
  });

  it("atravessa a mudança de UTC-5 para UTC-4 sem errar a hora local", () => {
    // sexta 06/03 16h (UTC-5) + 4h úteis → segunda 09/03 10h, já em UTC-4 (14h UTC)
    const deadline = newYork.addBusinessMinutes(new Date("2026-03-06T16:00:00-05:00"), FOUR_HOURS);

    expect(deadline.toISOString()).toBe("2026-03-09T14:00:00.000Z");
  });
});
