import { describe, expect, it } from "vitest";
import type { Article, KnowledgeBase } from "../ports/knowledge-base.ts";
import { createModel, createNexoAgent } from "./nexo-agent.ts";

const vpnArticle: Article = {
  id: "vpn",
  title: "VPN com erro 809",
  tags: ["vpn"],
  content: "Reinstale o cliente de VPN.",
};

/** Fake da porta: registra as buscas para o teste verificar o que o agent pediu. */
function createFakeKnowledgeBase(articles: Article[]) {
  const queries: string[] = [];
  const knowledgeBase: KnowledgeBase = {
    search: (query) => {
      queries.push(query);
      return articles;
    },
  };
  return { knowledgeBase, queries };
}

describe("Nexo Assist (modelo de teste)", () => {
  it("consulta a central de ajuda e responde citando o artigo", async () => {
    const { knowledgeBase, queries } = createFakeKnowledgeBase([vpnArticle]);
    const agent = createNexoAgent({ model: createModel({ LLM_MODE: "mock" }), knowledgeBase });

    const result = await agent.generate("Minha VPN dá erro 809");

    expect(queries).toEqual(["Minha VPN dá erro 809"]);
    expect(result.text).toContain("VPN com erro 809");
  });

  it("diz com honestidade quando não encontra artigo", async () => {
    const { knowledgeBase } = createFakeKnowledgeBase([]);
    const agent = createNexoAgent({ model: createModel({ LLM_MODE: "mock" }), knowledgeBase });

    const result = await agent.generate("Impressora travada");

    expect(result.text).toContain("Não encontrei");
  });
});
