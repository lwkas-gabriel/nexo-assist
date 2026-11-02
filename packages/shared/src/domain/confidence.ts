/**
 * Faixas de confiança de uma decisão (R09, R39). Os mesmos cortes no que o agent recebe da
 * etapa 1, no limiar que pergunta ou transfere e no painel de detalhe da tela.
 */

/** Abaixo disto, a confiança é baixa: o agent pergunta antes e, se continuar baixa, transfere (R39). */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
/** A partir daqui a confiança é alta; entre o limiar e isto, média. */
export const HIGH_CONFIDENCE = 0.8;

export type ConfidenceLevel = "baixa" | "média" | "alta";

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return "baixa";
  return confidence < HIGH_CONFIDENCE ? "média" : "alta";
}
