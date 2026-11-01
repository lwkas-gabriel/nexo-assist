import type { LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { CLASSIFIER_MARKER, type Classification } from "../agent/classifier.ts";

/**
 * Só para testes: modelo falso em que o teste escreve o que o "agent" faz (quais tools chama, com
 * que argumentos, e o texto final) e o que o classificador entende. Serve para provar que uma
 * expectativa reprova um agent errado e aprova um certo, sem depender do roteiro por palavras-chave.
 */
export type ScriptedStep =
  { call: { name: string; input: Record<string, unknown> } } | { text: string };

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

export function scriptedModel(options: {
  classification: Pick<Classification, "intent" | "confidence">;
  /** Um passo por chamada do agent ao modelo; o último se repete se faltar. */
  steps: readonly ScriptedStep[];
}) {
  let agentCalls = 0;
  const classification: Classification = {
    ...options.classification,
    understood: "Roteiro do teste.",
    extracted: {},
    reason: "Roteiro do teste.",
  };

  function nextStep(): ScriptedStep {
    const step = options.steps[Math.min(agentCalls, options.steps.length - 1)];
    agentCalls += 1;
    if (!step) throw new Error("Roteiro do modelo sem passos");
    return step;
  }

  return new MockLanguageModelV4({
    // O classificador usa generate; o agent do chat usa stream.
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(classification) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
    doStream: ({ prompt }) => {
      const isClassifier = prompt.some(
        (message) => message.role === "system" && message.content.includes(CLASSIFIER_MARKER),
      );
      if (isClassifier) throw new Error("O classificador deve usar generate");
      const step = nextStep();
      const body: LanguageModelV4StreamPart[] =
        "call" in step
          ? [
              {
                type: "tool-call",
                toolCallId: `call-${agentCalls}`,
                toolName: step.call.name,
                input: JSON.stringify(step.call.input),
              },
            ]
          : [
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: step.text },
              { type: "text-end", id: "t1" },
            ];
      const finishReason = {
        unified: "call" in step ? "tool-calls" : "stop",
        raw: undefined,
      } as const;
      return Promise.resolve({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            ...body,
            { type: "finish", usage: USAGE, finishReason },
          ] satisfies LanguageModelV4StreamPart[],
        }),
      });
    },
  });
}
