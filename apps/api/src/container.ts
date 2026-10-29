import { join } from "node:path";
import type { Mastra } from "@mastra/core/mastra";
import { createMarkdownKnowledgeBase } from "./adapters/markdown-knowledge-base.ts";
import { createModel, createNexoMastra } from "./agent/nexo-agent.ts";
import type { LlmConfig } from "./config.ts";
import { createRateLimiter, type RateLimiter } from "./http/rate-limiter.ts";
import { systemClock, type Clock } from "./ports/clock.ts";

/** Pasta com os artigos da central de ajuda, versionados com o código. */
const KNOWLEDGE_DIRECTORY = join(import.meta.dirname, "..", "knowledge");

/**
 * Proteção de custo do deploy público: o login aceita qualquer senha (requisito do desafio).
 * O teto diário vale para todos juntos e protege mesmo contra quem troca de IP.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CHAT_REQUESTS_PER_IP_PER_HOUR = 30;
const CHAT_REQUESTS_PER_DAY = 500;

export type ChatLimits = {
  perClient: RateLimiter;
  global: RateLimiter;
};

/** Tudo de que as rotas precisam, criado num único lugar. Nos testes, basta montar outro. */
export type Container = {
  mastra: Mastra;
  chatLimits: ChatLimits;
};

export function createContainer(llm: LlmConfig, clock: Clock = systemClock): Container {
  const knowledgeBase = createMarkdownKnowledgeBase(KNOWLEDGE_DIRECTORY);
  const model = createModel(llm);

  return {
    mastra: createNexoMastra({ model, knowledgeBase }),
    chatLimits: {
      perClient: createRateLimiter({
        limit: CHAT_REQUESTS_PER_IP_PER_HOUR,
        windowMs: HOUR_MS,
        clock,
      }),
      global: createRateLimiter({ limit: CHAT_REQUESTS_PER_DAY, windowMs: DAY_MS, clock }),
    },
  };
}
