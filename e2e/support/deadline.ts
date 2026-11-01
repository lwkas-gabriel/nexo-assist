const MINUTE_MS = 60_000;
/** Brasília não tem horário de verão desde 2019: o prazo da tela ("27/10, 13:43") é UTC-3 fixo. */
const BRASILIA_OFFSET = "-03:00";
const BRASILIA_DATE_TIME = /(\d{2})\/(\d{2}), (\d{2}):(\d{2})/;
const HALF_YEAR_MS = 183 * 24 * 60 * MINUTE_MS;

/** "resposta até 27/10, 13:43" → o instante. A tela não mostra o ano: vale o mais próximo de agora. */
export function parseBrasiliaDeadline(text: string, now: Date = new Date()): Date {
  const match = BRASILIA_DATE_TIME.exec(text);
  if (!match) throw new Error(`Sem prazo no texto: ${text}`);
  const [, day, month, hour, minute] = match;
  const year = now.getUTCFullYear();
  const at = (y: number) => new Date(`${y}-${month}-${day}T${hour}:${minute}:00${BRASILIA_OFFSET}`);
  const sameYear = at(year);
  // Dezembro lendo um prazo de janeiro (e o inverso): o ano vizinho fica mais perto.
  if (sameYear.getTime() - now.getTime() > HALF_YEAR_MS) return at(year - 1);
  if (now.getTime() - sameYear.getTime() > HALF_YEAR_MS) return at(year + 1);
  return sameYear;
}
