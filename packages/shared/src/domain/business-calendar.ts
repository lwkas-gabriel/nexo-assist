/**
 * Calendário de horário útil, independente do fuso do servidor (o Railway roda em UTC; achado R02).
 * Todo cálculo trabalha com instantes absolutos e converte para o horário local do fuso configurado
 * via Intl, então funciona também em fusos com horário de verão. Feriados não são considerados (A10).
 */

const MINUTE_MS = 60_000;
const SATURDAY = 6;
const SUNDAY = 0;

type LocalDate = { year: number; month: number; day: number };

type BusinessCalendarOptions = {
  timeZone: string;
  /** Hora local em que o atendimento começa (ex.: 8). */
  openingHour: number;
  /** Hora local em que o atendimento termina (ex.: 18). */
  closingHour: number;
};

export type BusinessCalendar = {
  /** Instante em que se completam `minutes` minutos de horário útil a partir de `start`. */
  addBusinessMinutes(start: Date, minutes: number): Date;
  /** Duração de um dia útil, em minutos. */
  readonly businessDayMinutes: number;
};

export function createBusinessCalendar({
  timeZone,
  openingHour,
  closingHour,
}: BusinessCalendarOptions): BusinessCalendar {
  const partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  /** Data e hora locais do fuso para um instante. */
  function toLocal(instant: number) {
    const parts = new Map(
      partsFormatter
        .formatToParts(new Date(instant))
        .map((part) => [part.type, Number(part.value)]),
    );
    const read = (type: Intl.DateTimeFormatPartTypes) => parts.get(type) ?? 0;
    return {
      year: read("year"),
      month: read("month"),
      day: read("day"),
      hour: read("hour"),
      minute: read("minute"),
      second: read("second"),
    };
  }

  /** Diferença entre o horário local e o UTC num instante (ex.: -180 min em São Paulo). */
  function offsetMs(instant: number): number {
    const local = toLocal(instant);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    return localAsUtc - Math.floor(instant / 1000) * 1000;
  }

  /** Instante absoluto de uma hora local. Recalcula o fuso uma vez para acertar viradas de horário de verão. */
  function localTimeToInstant(date: LocalDate, hour: number): number {
    const asUtc = Date.UTC(date.year, date.month - 1, date.day, hour);
    const firstGuess = asUtc - offsetMs(asUtc);
    return asUtc - offsetMs(firstGuess);
  }

  function isWorkday(date: LocalDate): boolean {
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    return weekday !== SATURDAY && weekday !== SUNDAY;
  }

  function nextDay(date: LocalDate): LocalDate {
    const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }

  function nextOpening(after: LocalDate): number {
    let date = nextDay(after);
    while (!isWorkday(date)) date = nextDay(date);
    return localTimeToInstant(date, openingHour);
  }

  function addBusinessMinutes(start: Date, minutes: number): Date {
    let cursor = start.getTime();
    let remainingMs = minutes * MINUTE_MS;

    // Avança dia útil a dia útil, consumindo o tempo disponível entre a abertura e o fechamento.
    for (;;) {
      const today = toLocal(cursor);
      const opening = localTimeToInstant(today, openingHour);
      const closing = localTimeToInstant(today, closingHour);

      if (!isWorkday(today) || cursor >= closing) {
        cursor = nextOpening(today);
        continue;
      }
      cursor = Math.max(cursor, opening);

      const availableMs = closing - cursor;
      if (remainingMs <= availableMs) {
        return new Date(cursor + remainingMs);
      }
      remainingMs -= availableMs;
      cursor = nextOpening(today);
    }
  }

  return {
    addBusinessMinutes,
    businessDayMinutes: (closingHour - openingHour) * 60,
  };
}

/** RN13: o service desk atende de segunda a sexta, das 8h às 18h, no horário de Brasília. */
export const NEXO_BUSINESS_CALENDAR = createBusinessCalendar({
  timeZone: "America/Sao_Paulo",
  openingHour: 8,
  closingHour: 18,
});
