import type { Clock } from "@nexo/shared/domain";
import type { LoginStats } from "@nexo/shared/contracts";
import type { StatsStore } from "../db/stats-store.ts";

/** Janela dos números: a última semana de atendimento. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Os números mudam devagar; o cache evita refazer as contas a cada visita à tela de login. */
const CACHE_MS = 30 * 1000;

/**
 * Números da tela de login (A11), calculados do próprio banco, em vez dos ilustrativos do
 * protótipo. Sem dados ainda, o valor é nulo e a tela diz isso: nada de número inventado.
 */
export function createStatsService({
  statsStore,
  clock,
}: {
  statsStore: StatsStore;
  clock: Clock;
}) {
  let cached: { at: number; stats: LoginStats } | undefined;

  async function compute(now: Date): Promise<LoginStats> {
    const since = new Date(now.getTime() - WINDOW_MS);
    const latencyMs = await statsStore.averageAgentLatencyMs(since);
    const { withAgent, handedOff } = await statsStore.conversationsSince(since);
    return {
      averageReplySeconds: latencyMs === null ? null : Math.round(latencyMs / 100) / 10,
      answeredWithoutAnalystPercent:
        withAgent === 0
          ? null
          : Math.min(100, Math.max(0, Math.round(((withAgent - handedOff) / withAgent) * 100))),
      analystsSignedIn: await statsStore.analystsSignedIn(now),
    };
  }

  return {
    async loginStats(): Promise<LoginStats> {
      const now = clock.now();
      if (cached && now.getTime() - cached.at < CACHE_MS) return cached.stats;
      const stats = await compute(now);
      cached = { at: now.getTime(), stats };
      return stats;
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
