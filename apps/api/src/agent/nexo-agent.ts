import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { Mastra } from "@mastra/core/mastra";
import type { LlmConfig } from "../config.ts";
import type { KnowledgeBase } from "../ports/knowledge-base.ts";
import { NEXO_INSTRUCTIONS } from "./instructions.ts";
import { createMockModel } from "./mock-model.ts";
import { createSearchKnowledgeBaseTool } from "./tools/search-knowledge-base.ts";

export const NEXO_AGENT_ID = "nexo-assist";

/**
 * Uma nova tentativa cobre uma falha passageira do provedor. Mais que isso só atrasa a resposta
 * quando a cota gratuita por minuto acabou (o padrão do AI SDK são 2 tentativas, ~6 s de espera).
 */
const MODEL_MAX_RETRIES = 1;

/**
 * A chave vem do config.ts (nunca lida aqui de process.env), passada explicitamente ao Mastra.
 * No modo mock, um modelo falso roteirizado substitui o Gemini.
 */
export function createModel(llm: LlmConfig): MastraModelConfig {
  if (llm.LLM_MODE === "mock") {
    return createMockModel();
  }
  return { id: `google/${llm.LLM_MODEL}` as const, apiKey: llm.GEMINI_API_KEY };
}

type NexoAgentDependencies = {
  model: MastraModelConfig;
  knowledgeBase: KnowledgeBase;
};

export function createNexoAgent({ model, knowledgeBase }: NexoAgentDependencies) {
  return new Agent({
    id: NEXO_AGENT_ID,
    name: "Nexo Assist",
    instructions: NEXO_INSTRUCTIONS,
    model,
    maxRetries: MODEL_MAX_RETRIES,
    tools: { search_knowledge_base: createSearchKnowledgeBaseTool(knowledgeBase) },
    defaultOptions: {
      // Raciocínio baixo: chat de service desk não precisa de raciocínio longo; menos tokens
      // por chamada rende mais dentro da cota gratuita e responde mais rápido (ADR-0010).
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    },
  });
}

/** Instância do Mastra usada pela rota de chat para localizar o agent. */
export function createNexoMastra(dependencies: NexoAgentDependencies) {
  return new Mastra({ agents: { nexoAssist: createNexoAgent(dependencies) } });
}
