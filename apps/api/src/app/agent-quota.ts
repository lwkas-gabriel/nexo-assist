import type { Clock } from "@nexo/shared/domain";
import type { UsageCounterStore } from "../db/usage-counter-store.ts";
import type { RateLimiter } from "../http/rate-limiter.ts";
import { providerQuotaDay } from "./quota-day.ts";

/**
 * Limites em memória, por janela curta. Ficam acessíveis para os testes trocarem um deles.
 * Mensagens ao analista e botões não gastam o modelo, mas gravam na conversa (RT13).
 */
export type ChatLimits = {
  perUser: RateLimiter;
  /** A13: o login aceita qualquer senha, então uma pessoa pode usar todas as contas de demonstração. */
  perIp: RateLimiter;
  globalPerMinute: RateLimiter;
  toAnalystPerUser: RateLimiter;
  draftActionsPerUser: RateLimiter;
};

/** Tetos diários, contados no banco, no dia da cota do provedor. */
export type DailyCaps = {
  /** Somando todos (ADR-0010). */
  global: number;
  /** Por IP: esgotar o dia de todos exige vários IPs, não uma pessoa em 2 horas. */
  perIp: number;
};

type AgentQuotaDependencies = {
  limits: ChatLimits;
  dailyCaps: DailyCaps;
  usageCounterStore: UsageCounterStore;
  clock: Clock;
};

/**
 * Cota do modelo (ADR-0010, A13). É consumida pelo caso de uso do chat, depois da trava da
 * conversa e da leitura final do estado dela: o que decide se o modelo vai ser chamado é o mesmo
 * que decide qual limite gastar, sem uma leitura separada na rota.
 */
export function createAgentQuota({
  limits,
  dailyCaps,
  usageCounterStore,
  clock,
}: AgentQuotaDependencies) {
  return {
    /** Mensagem que vai para o modelo: limites por funcionário, por IP e globais. */
    async tryConsumeForAgent(request: { employeeId: string; ip: string }): Promise<boolean> {
      const withinShortWindows =
        limits.perUser.tryConsume(request.employeeId) &&
        limits.perIp.tryConsume(request.ip) &&
        limits.globalPerMinute.tryConsume("global");
      if (!withinShortWindows) return false;
      const day = providerQuotaDay(clock.now());
      // O teto por IP vem antes do global: quem passa do próprio limite não gasta o de todos.
      return (
        (await usageCounterStore.tryIncrement(`ip:${request.ip}`, day, dailyCaps.perIp)) &&
        (await usageCounterStore.tryIncrement("global", day, dailyCaps.global))
      );
    },

    /** Mensagem para o analista: não chama o modelo, só tem o limite por funcionário (R42). */
    tryConsumeForAnalyst(employeeId: string): boolean {
      return limits.toAnalystPerUser.tryConsume(employeeId);
    },
  };
}

export type AgentQuota = ReturnType<typeof createAgentQuota>;
