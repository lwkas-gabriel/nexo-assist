/** Fuso do service desk (RN13): datas mostradas ao funcionário e ao agent sempre nele. */
const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

/**
 * Tempo decorrido em texto ("2 horas", "5 dias"), para frases como "sem resposta há 5 dias".
 * Abaixo de um dia conta em horas: os prazos de Crítica (1 h) e Alta (4 h úteis) vencem antes disso.
 */
export function describeElapsed(from: Date, now: Date): string {
  const elapsedMs = Math.max(0, now.getTime() - from.getTime());
  if (elapsedMs < HOUR_MS) return "menos de 1 hora";
  if (elapsedMs < DAY_MS) return plural(Math.floor(elapsedMs / HOUR_MS), "hora", "horas");
  return plural(Math.floor(elapsedMs / DAY_MS), "dia", "dias");
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
