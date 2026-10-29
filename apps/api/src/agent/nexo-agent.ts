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
 * A chave vem do config.ts (nunca lida aqui de process.env), passada explicitamente ao Mastra.
 * No modo mock, um modelo falso roteirizado substitui o Claude.
 */
export function createModel(llm: LlmConfig): MastraModelConfig {
  if (llm.LLM_MODE === "mock") {
    return createMockModel();
  }
  return { id: `anthropic/${llm.LLM_MODEL}` as const, apiKey: llm.ANTHROPIC_API_KEY };
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
    tools: { search_knowledge_base: createSearchKnowledgeBaseTool(knowledgeBase) },
    defaultOptions: {
      // Esforço baixo: chat de service desk não precisa de raciocínio longo (custo e latência).
      // Ver docs/decisions/0008-modelo-claude-haiku.md.
      providerOptions: { anthropic: { effort: "low" } },
    },
  });
}

/** Instância do Mastra usada pela rota de chat para localizar o agent. */
export function createNexoMastra(dependencies: NexoAgentDependencies) {
  return new Mastra({ agents: { nexoAssist: createNexoAgent(dependencies) } });
}
