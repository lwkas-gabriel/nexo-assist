import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { Mastra } from "@mastra/core/mastra";
import type { Clock } from "@nexo/shared/domain";
import type { DraftService } from "../app/draft-service.ts";
import type { HandoffService } from "../app/handoff-service.ts";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { LlmConfig } from "../config.ts";
import type { KnowledgeBase } from "../ports/knowledge-base.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { NEXO_INSTRUCTIONS } from "./instructions.ts";
import { RETRY_SETTINGS } from "./model-settings.ts";
import { createMockModel } from "./mock-model.ts";
import { createDraftTools } from "./tools/draft-tools.ts";
import { createHandoffTool, HANDOFF_TO_ANALYST_TOOL_ID } from "./tools/handoff-tool.ts";
import { createSearchKnowledgeBaseTool } from "./tools/search-knowledge-base.ts";
import { createTicketTools } from "./tools/ticket-tools.ts";

export const NEXO_AGENT_ID = "nexo-assist";

/**
 * No máximo 3 chamadas ao modelo por resposta (ex.: duas tools e a resposta). Com o classificador,
 * são até 4 por mensagem, a conta dos tetos de uso do ADR-0010.
 */
export const AGENT_MAX_STEPS = 3;

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

export type NexoAgentDependencies = {
  model: MastraModelConfig;
  knowledgeBase: KnowledgeBase;
  ticketGateway: TicketGateway;
  draftService: DraftService;
  handoffService: HandoffService;
  conversationStore: ConversationStore;
  clock: Clock;
};

export function createNexoAgent({
  model,
  knowledgeBase,
  ticketGateway,
  draftService,
  handoffService,
  conversationStore,
  clock,
}: NexoAgentDependencies) {
  return new Agent({
    id: NEXO_AGENT_ID,
    name: "Nexo Assist",
    instructions: NEXO_INSTRUCTIONS,
    model,
    ...RETRY_SETTINGS,
    tools: {
      search_knowledge_base: createSearchKnowledgeBaseTool(knowledgeBase),
      ...createTicketTools({ ticketGateway, clock }),
      ...createDraftTools({ draftService, handoffService, conversationStore }),
      [HANDOFF_TO_ANALYST_TOOL_ID]: createHandoffTool({ handoffService }),
    },
    defaultOptions: {
      maxSteps: AGENT_MAX_STEPS,
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
