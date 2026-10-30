/** Fuso do service desk (RN13): datas mostradas ao funcionário e ao agent sempre nele. */
const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const DAY_MS = 24 * 60 * 60 * 1000;

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Data e hora no horário de Brasília, no formato do protótipo ("16/10, 14:20").
 * O agent recebe as datas já assim: não precisa converter fuso (fonte comum de erro de um LLM).
 */
export function formatBrasiliaDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

/** Dias inteiros desde `from` até `now` ("sem atualização há 5 dias"). */
export function wholeDaysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}
