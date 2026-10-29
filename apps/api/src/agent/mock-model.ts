import type {
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { SEARCH_KNOWLEDGE_BASE_TOOL_ID } from "./tools/search-knowledge-base.ts";

/**
 * Modelo falso e previsível, usado com LLM_MODE=mock (testes E2E e CI): sem custo e sem chave.
 *
 * Roteiro:
 * 1. Mensagem do funcionário → chama search_knowledge_base com o texto dela.
 * 2. Resultado da busca → responde citando o primeiro artigo encontrado.
 *
 * Implementa as duas formas de chamada (com e sem streaming) a partir do mesmo roteiro.
 */
export function createMockModel() {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "nexo-mock",
    doGenerate: ({ prompt }) => {
      const step = nextStep(prompt);
      return Promise.resolve({
        content: [toContent(step)],
        finishReason: finishReasonOf(step),
        usage: NO_USAGE,
        warnings: [],
      });
    },
    doStream: ({ prompt }) =>
      Promise.resolve({
        stream: simulateReadableStream({ chunks: toStreamParts(nextStep(prompt)) }),
      }),
  });
}

type Step = { kind: "search"; query: string } | { kind: "answer"; text: string };

const NO_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const TOOL_CALL_ID = "mock-call-1";
const TEXT_ID = "mock-text-1";

function nextStep(prompt: LanguageModelV4Prompt): Step {
  const lastMessage = prompt.at(-1);
  if (lastMessage?.role === "tool") {
    return { kind: "answer", text: answerFromToolResult(lastMessage.content) };
  }
  return { kind: "search", query: lastUserText(prompt) };
}

function toContent(step: Step): LanguageModelV4Content {
  return step.kind === "search"
    ? {
        type: "tool-call",
        toolCallId: TOOL_CALL_ID,
        toolName: SEARCH_KNOWLEDGE_BASE_TOOL_ID,
        input: JSON.stringify({ query: step.query }),
      }
    : { type: "text", text: step.text };
}

function finishReasonOf(step: Step): LanguageModelV4FinishReason {
  return { unified: step.kind === "search" ? "tool-calls" : "stop", raw: undefined };
}

function toStreamParts(step: Step): LanguageModelV4StreamPart[] {
  const body: LanguageModelV4StreamPart[] =
    step.kind === "search"
      ? [
          {
            type: "tool-call",
            toolCallId: TOOL_CALL_ID,
            toolName: SEARCH_KNOWLEDGE_BASE_TOOL_ID,
            input: JSON.stringify({ query: step.query }),
          },
        ]
      : [
          { type: "text-start", id: TEXT_ID },
          { type: "text-delta", id: TEXT_ID, delta: step.text },
          { type: "text-end", id: TEXT_ID },
        ];

  return [
    { type: "stream-start", warnings: [] },
    ...body,
    { type: "finish", usage: NO_USAGE, finishReason: finishReasonOf(step) },
  ];
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  const lastUser = prompt.findLast((message) => message.role === "user");
  if (!lastUser) return "";
  return lastUser.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

function answerFromToolResult(content: unknown): string {
  const title = firstArticleTitle(content);
  return title
    ? `Encontrei na central de ajuda o artigo "${title}". (resposta do modelo de teste)`
    : "Não encontrei um artigo sobre isso na central de ajuda. (resposta do modelo de teste)";
}

/** Lê o título do primeiro artigo no resultado da tool, sem depender do formato exato. */
function firstArticleTitle(content: unknown): string | undefined {
  const match = /"title":"([^"]+)"/.exec(JSON.stringify(content));
  return match?.[1];
}
