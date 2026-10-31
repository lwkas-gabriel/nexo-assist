import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createClassifier } from "./classifier.ts";
import { createMockModel } from "./mock-model.ts";

describe("classificador (etapa 1, R05)", () => {
  it("devolve intenção, o que entendeu e confiança, validados pelo schema", async () => {
    const classifier = createClassifier(createMockModel());

    const result = await classifier.classify(
      [{ speaker: "Nexo Assist", text: "Como posso ajudar?" }],
      "Quero abrir um chamado: o notebook não liga",
    );

    expect(result).toMatchObject({
      ok: true,
      classification: { intent: "new_ticket", confidence: 0.9 },
    });
  });

  it("mensagem vaga sai com confiança baixa", async () => {
    const classifier = createClassifier(createMockModel());

    const result = await classifier.classify(
      [],
      "Tá dando alguma coisa estranha, não sei explicar",
    );

    expect(result.classification).toMatchObject({ intent: "unclear", confidence: 0.3 });
  });

  it("se o modelo falhar, o turno segue com uma classificação neutra (não quebra o chat)", async () => {
    // Erro que não é repetido (o 429 é tentado de novo, com espera).
    const broken = () => Promise.reject(new Error("modelo fora do ar"));
    const failing = new MockLanguageModelV4({ doGenerate: broken, doStream: broken });
    const classifier = createClassifier(failing);

    const result = await classifier.classify([], "oi");

    expect(result).toMatchObject({
      ok: false,
      classification: { intent: "unclear", confidence: 0.5 },
    });
  });

  it("texto longo do modelo é cortado, sem perder a classificação", async () => {
    const answer = JSON.stringify({
      intent: "it_question",
      understood: "a".repeat(500),
      extracted: {},
      confidence: 0.8,
      reason: "b".repeat(500),
    });
    const text = [{ type: "text" as const, text: answer }];
    const finish = { unified: "stop" as const, raw: undefined };
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const verbose = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve({ content: text, finishReason: finish, usage, warnings: [] }),
    });

    const result = await createClassifier(verbose).classify([], "oi");

    expect(result.ok).toBe(true);
    expect(result.classification.understood).toHaveLength(300);
    expect(result.classification.reason).toHaveLength(300);
  });
});
