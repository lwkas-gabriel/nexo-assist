import { describe, expect, it } from "vitest";
import { summarizeUsage } from "./usage-report.ts";

describe("relatório de custo (RT10)", () => {
  it("soma classificador e agent, por turno e por conversa, com a latência em percentis", () => {
    const report = summarizeUsage([
      {
        conversationId: "a",
        isButtonAction: false,
        classifierTokens: 100,
        agentTokens: 900,
        latencyMs: 1000,
      },
      {
        conversationId: "a",
        isButtonAction: false,
        classifierTokens: 100,
        agentTokens: 400,
        latencyMs: 3000,
      },
      {
        conversationId: "b",
        isButtonAction: false,
        classifierTokens: null,
        agentTokens: null,
        latencyMs: 200,
      },
      // Clique de botão: fica de fora (não é turno do modelo).
      {
        conversationId: "c",
        isButtonAction: true,
        classifierTokens: null,
        agentTokens: null,
        latencyMs: 0,
      },
    ]);

    expect(report).toEqual({
      turns: 3,
      conversations: 2,
      tokensPerTurn: 500,
      tokensPerConversation: 750,
      latencyP50Ms: 1000,
      latencyP95Ms: 3000,
    });
  });

  it("sem registros, tudo zero", () => {
    expect(summarizeUsage([])).toMatchObject({ turns: 0, tokensPerTurn: 0, latencyP50Ms: 0 });
  });
});
