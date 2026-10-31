import { z } from "zod";

/**
 * Números da tela de login (A11), calculados pela api. Nulo quando ainda não há dados: a tela
 * mostra um travessão, nunca um número inventado.
 */
export const loginStatsSchema = z.object({
  /** Tempo médio do turno do assistente (da mensagem ao fim da resposta), em segundos. */
  averageReplySeconds: z.number().nonnegative().nullable(),
  /** Percentual das conversas atendidas pelo agent que não foram para um analista. */
  answeredWithoutAnalystPercent: z.number().min(0).max(100).nullable(),
  /** Analistas com sessão aberta (a presença em tempo real chega com o console, T23). */
  analystsSignedIn: z.number().int().nonnegative(),
});
export type LoginStats = z.infer<typeof loginStatsSchema>;
