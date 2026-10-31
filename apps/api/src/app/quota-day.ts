/** O Gemini reinicia a cota diária gratuita à meia-noite do horário do Pacífico. */
const PROVIDER_QUOTA_TIME_ZONE = "America/Los_Angeles";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROVIDER_QUOTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * O dia da cota do provedor (AAAA-MM-DD), que é a chave dos tetos diários. Uma janela de 24 h a
 * partir da primeira mensagem deixaria passar até o dobro num mesmo dia do Gemini (ADR-0010).
 */
export function providerQuotaDay(now: Date): string {
  return dayFormat.format(now);
}
