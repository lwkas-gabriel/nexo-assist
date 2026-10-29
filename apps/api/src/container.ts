import { join } from "node:path";
import type { Mastra } from "@mastra/core/mastra";
import { createMarkdownKnowledgeBase } from "./adapters/markdown-knowledge-base.ts";
import { createModel, createNexoMastra } from "./agent/nexo-agent.ts";
import type { LlmConfig } from "./config.ts";

/** Pasta com os artigos da central de ajuda, versionados com o código. */
const KNOWLEDGE_DIRECTORY = join(import.meta.dirname, "..", "knowledge");

/** Tudo de que as rotas precisam, criado num único lugar. Nos testes, basta montar outro. */
export type Container = {
  mastra: Mastra;
};

export function createContainer(llm: LlmConfig): Container {
  const knowledgeBase = createMarkdownKnowledgeBase(KNOWLEDGE_DIRECTORY);
  const model = createModel(llm);

  return {
    mastra: createNexoMastra({ model, knowledgeBase }),
  };
}
