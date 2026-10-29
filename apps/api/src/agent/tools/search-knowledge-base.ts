import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { KnowledgeBase } from "../../ports/knowledge-base.ts";

/** Quantos artigos voltam por busca: o bastante para escolher, pouco para não gastar tokens. */
const MAX_ARTICLES = 3;

export const SEARCH_KNOWLEDGE_BASE_TOOL_ID = "search_knowledge_base";

export function createSearchKnowledgeBaseTool(knowledgeBase: KnowledgeBase) {
  return createTool({
    id: SEARCH_KNOWLEDGE_BASE_TOOL_ID,
    description:
      "Busca artigos da central de ajuda de TI da Nexo. Use antes de responder qualquer dúvida de TI.",
    inputSchema: z.object({
      query: z.string().min(1).max(300).describe("O problema ou a dúvida, em poucas palavras"),
    }),
    outputSchema: z.object({
      articles: z.array(z.object({ id: z.string(), title: z.string(), content: z.string() })),
    }),
    execute: ({ query }) => {
      const articles = knowledgeBase.search(query, MAX_ARTICLES);
      return Promise.resolve({
        articles: articles.map(({ id, title, content }) => ({ id, title, content })),
      });
    },
  });
}
