import type {
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { CLASSIFIER_MARKER, type Classification } from "./classifier.ts";
import { CONFIRM_DRAFT_TOOL_ID, PROPOSE_TICKET_DRAFT_TOOL_ID } from "./tools/draft-tools.ts";
import { HANDOFF_TO_ANALYST_TOOL_ID } from "./tools/handoff-tool.ts";
import { SEARCH_KNOWLEDGE_BASE_TOOL_ID } from "./tools/search-knowledge-base.ts";
import { GET_TICKET_TOOL_ID, LIST_MY_TICKETS_TOOL_ID } from "./tools/ticket-tools.ts";

/**
 * Modelo falso e previsível, usado com LLM_MODE=mock (testes e CI): sem chave e sem chamadas externas.
 *
 * Roteiro, imitando o que o modelo real faz:
 * 1. Mensagem do funcionário → escolhe a tool pelo texto:
 *    "analista"/"atendente" → handoff_to_analyst;
 *    "confirmo"/"pode criar" → confirm_draft do último rascunho mostrado; "abrir chamado" →
 *    propose_ticket_draft com o próprio texto; número de chamado → get_ticket;
 *    "chamado"/"status" → list_my_tickets; o resto → central de ajuda.
 * 2. Resultado da tool → responde com base nele.
 * O classificador (etapa 1) recebe um JSON roteirizado pelo mesmo texto; "não sei explicar" e
 * mensagens vagas saem com confiança baixa, para os testes do limiar (R39).
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
        usage: MOCK_USAGE,
        warnings: [],
      });
    },
    doStream: ({ prompt }) =>
      Promise.resolve({
        stream: simulateReadableStream({ chunks: toStreamParts(nextStep(prompt)) }),
      }),
  });
}

const TEST_MODEL_NOTE = "(resposta do modelo de teste)";

type Step =
  | { kind: "call"; toolName: string; input: Record<string, unknown> }
  | { kind: "answer"; text: string };

/** Consumo fixo por chamada (100 de entrada + 20 de saída), para os testes de custo terem o que somar. */
const MOCK_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

const TOOL_CALL_ID = "mock-call-1";
const TEXT_ID = "mock-text-1";
const TICKET_NUMBER_IN_TEXT = /\b(INC|REQ)[\s_-]?\d{5}\b/i;
const CONFIRMATION_IN_TEXT = /\b(confirmo|pode criar|pode abrir|pode enviar)\b/i;
const OPEN_TICKET_IN_TEXT = /\b(abrir|abre|abra)\b.*\bchamado\b/i;
const DRAFT_ID_IN_TEXT = /\bD-\d+\b/g;
const ANALYST_IN_TEXT = /\b(analista|atendente)\b/i;

function nextStep(prompt: LanguageModelV4Prompt): Step {
  if (isClassifierCall(prompt)) {
    return { kind: "answer", text: JSON.stringify(classify(lastUserText(prompt))) };
  }
  const lastMessage = prompt.at(-1);
  if (lastMessage?.role === "tool") {
    return { kind: "answer", text: answerFromToolResult(lastMessage.content) };
  }
  return chooseTool(lastUserText(prompt), lastDraftIdShown(prompt));
}

function chooseTool(userText: string, draftId: string | undefined): Step {
  if (ANALYST_IN_TEXT.test(userText)) {
    return {
      kind: "call",
      toolName: HANDOFF_TO_ANALYST_TOOL_ID,
      input: { reason: "employee_request", problem: userText, attempted: "nada ainda" },
    };
  }
  if (draftId && CONFIRMATION_IN_TEXT.test(userText)) {
    return { kind: "call", toolName: CONFIRM_DRAFT_TOOL_ID, input: { draftId } };
  }
  if (OPEN_TICKET_IN_TEXT.test(userText)) {
    return { kind: "call", toolName: PROPOSE_TICKET_DRAFT_TOOL_ID, input: draftFrom(userText) };
  }
  const ticketNumber = TICKET_NUMBER_IN_TEXT.exec(userText)?.[0];
  if (ticketNumber) {
    return { kind: "call", toolName: GET_TICKET_TOOL_ID, input: { number: ticketNumber } };
  }
  if (/chamado|status/i.test(userText)) {
    return { kind: "call", toolName: LIST_MY_TICKETS_TOOL_ID, input: { filter: "open" } };
  }
  return { kind: "call", toolName: SEARCH_KNOWLEDGE_BASE_TOOL_ID, input: { query: userText } };
}

function toContent(step: Step): LanguageModelV4Content {
  return step.kind === "call"
    ? {
        type: "tool-call",
        toolCallId: TOOL_CALL_ID,
        toolName: step.toolName,
        input: JSON.stringify(step.input),
      }
    : { type: "text", text: step.text };
}

function finishReasonOf(step: Step): LanguageModelV4FinishReason {
  return { unified: step.kind === "call" ? "tool-calls" : "stop", raw: undefined };
}

function toStreamParts(step: Step): LanguageModelV4StreamPart[] {
  const body: LanguageModelV4StreamPart[] =
    step.kind === "call"
      ? [
          {
            type: "tool-call",
            toolCallId: TOOL_CALL_ID,
            toolName: step.toolName,
            input: JSON.stringify(step.input),
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
    { type: "finish", usage: MOCK_USAGE, finishReason: finishReasonOf(step) },
  ];
}

function isClassifierCall(prompt: LanguageModelV4Prompt): boolean {
  return prompt.some(
    (message) => message.role === "system" && message.content.includes(CLASSIFIER_MARKER),
  );
}

// Sem \b: em JavaScript, letras acentuadas ("lá") não contam como letra para o \b.
const VAGUE_IN_TEXT = /(não sei explicar|sei lá|alguma coisa estranha|não sei o que)/i;

/** Classificação roteirizada da mensagem nova (a última linha do prompt do classificador). */
function classify(prompt: string): Classification {
  const text = prompt.split("Mensagem nova do funcionário:").at(-1)?.trim() ?? prompt;
  const base = {
    understood: text.slice(0, 120),
    extracted: {},
    reason: "Roteiro do modelo de teste.",
  };
  if (VAGUE_IN_TEXT.test(text)) return { ...base, intent: "unclear", confidence: 0.3 };
  if (ANALYST_IN_TEXT.test(text)) return { ...base, intent: "talk_to_analyst", confidence: 0.95 };
  if (CONFIRMATION_IN_TEXT.test(text)) return { ...base, intent: "confirm_draft", confidence: 0.9 };
  if (OPEN_TICKET_IN_TEXT.test(text)) return { ...base, intent: "new_ticket", confidence: 0.9 };
  if (TICKET_NUMBER_IN_TEXT.test(text) || /chamado|status/i.test(text)) {
    return { ...base, intent: "ticket_status", confidence: 0.85 };
  }
  return { ...base, intent: "it_question", confidence: 0.8 };
}

/**
 * Rascunho roteirizado: o modelo real extrairia os campos da conversa; aqui o próprio texto vira
 * título e descrição, com classificação fixa (só eu, parado → Alta).
 */
function draftFrom(userText: string) {
  return {
    title: userText.slice(0, 60),
    description: userText,
    type: "incident",
    category: "other",
    affected: "just_me",
    urgency: "blocked",
    duplicatesReviewed: true,
  };
}

/**
 * Último "D-n" que o agent escreveu na conversa, ou que o contexto de sistema lista como pendente
 * (numa sessão nova, as mensagens que o mostraram já não estão no histórico, R03).
 */
function lastDraftIdShown(prompt: LanguageModelV4Prompt): string | undefined {
  const texts = prompt.flatMap((message) => {
    // Do contexto de sistema, só a linha de pendentes: as instruções também citam um "D-3".
    if (message.role === "system") {
      return message.content.split("\n").filter((line) => line.startsWith("Rascunhos pendentes"));
    }
    if (message.role !== "assistant") return [];
    return message.content.map((part) => (part.type === "text" ? part.text : ""));
  });
  return texts.join(" ").match(DRAFT_ID_IN_TEXT)?.at(-1);
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  const lastUser = prompt.findLast((message) => message.role === "user");
  if (!lastUser) return "";
  return lastUser.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

/** Resultado de tool como o AI SDK o entrega ao modelo: o valor JSON fica em `output.value`. */
const toolResultSchema = z.object({
  type: z.literal("tool-result"),
  toolName: z.string(),
  output: z.object({ value: z.unknown() }),
});

const ticketSchema = z.object({
  number: z.string(),
  title: z.string(),
  status: z.string(),
  deadline: z.object({ isOverdue: z.boolean(), rule: z.string() }).nullable(),
  timeWithoutTeamResponse: z.string(),
});
const listResultSchema = z.object({ ok: z.literal(true), tickets: z.array(ticketSchema) });
const getResultSchema = z.object({ ok: z.literal(true), ticket: ticketSchema });
const failureSchema = z.object({
  ok: z.literal(false),
  reason: z.string(),
  detail: z.string().optional(),
});
const draftResultSchema = z.object({
  ok: z.literal(true),
  draft: z.object({
    draftId: z.string(),
    ticket: z.object({ title: z.string(), priority: z.string() }).optional(),
  }),
});
const handoffResultSchema = z.object({
  ok: z.literal(true),
  handoff: z.object({ supportLevel: z.string(), responseBy: z.string() }),
});
const confirmResultSchema = z.object({
  ok: z.literal(true),
  ticket: z.object({ number: z.string() }),
});
/** Como o prompt manda responder a cada falha das tools de chamados. */
const FAILURE_ANSWERS: Record<string, string> = {
  not_found: "Não encontrei esse chamado entre os seus.",
  tickets_unavailable:
    "O sistema de chamados está instável no momento; tente de novo em instantes.",
  invalid_number: "Pode confirmar o número no formato INC-12345 ou REQ-12345?",
  tickets_error: "Não consegui consultar seus chamados agora; tente de novo em instantes.",
  incomplete: "Para montar o rascunho, preciso de mais alguns detalhes.",
  possible_duplicate: "Você já tem um chamado parecido aberto.",
  cannot_reopen: "Esse chamado foi resolvido há mais de 7 dias; vamos abrir um novo.",
  default: "Não consegui consultar seus chamados agora.",
};

const searchResultSchema = z.object({ articles: z.array(z.object({ title: z.string() })) });

function answerFromToolResult(content: unknown): string {
  const result = z
    .array(z.unknown())
    .catch([])
    .parse(content)
    .map((part) => toolResultSchema.safeParse(part))
    .find((parsed) => parsed.success);
  if (!result?.success) return `Não consegui ler o resultado. ${TEST_MODEL_NOTE}`;
  const { toolName, output } = result.data;

  const failure = failureSchema.safeParse(output.value);
  if (failure.success) {
    const answer =
      failure.data.detail ?? FAILURE_ANSWERS[failure.data.reason] ?? FAILURE_ANSWERS.default;
    return `${answer} ${TEST_MODEL_NOTE}`;
  }

  if (toolName === PROPOSE_TICKET_DRAFT_TOOL_ID) return answerDraft(output.value);
  if (toolName === CONFIRM_DRAFT_TOOL_ID) return answerConfirmation(output.value);
  if (toolName === HANDOFF_TO_ANALYST_TOOL_ID) return answerHandoff(output.value);
  if (toolName === LIST_MY_TICKETS_TOOL_ID) return answerTicketList(output.value);
  if (toolName === GET_TICKET_TOOL_ID) return answerTicket(output.value);
  return answerArticleSearch(output.value);
}

function answerTicketList(value: unknown): string {
  const parsed = listResultSchema.safeParse(value);
  if (!parsed.success || parsed.data.tickets.length === 0) {
    return `Você não tem chamados abertos. ${TEST_MODEL_NOTE}`;
  }
  const lines = parsed.data.tickets.map(
    (ticket) => `${ticket.number} · ${ticket.title} (${ticket.status})`,
  );
  return `Você tem ${lines.length} chamados abertos: ${lines.join("; ")}. ${TEST_MODEL_NOTE}`;
}

function answerTicket(value: unknown): string {
  const parsed = getResultSchema.safeParse(value);
  if (!parsed.success) return `Não encontrei esse chamado. ${TEST_MODEL_NOTE}`;
  const { number, status, deadline, timeWithoutTeamResponse } = parsed.data.ticket;
  const overdue = deadline?.isOverdue
    ? ` Está sem resposta da TI há ${timeWithoutTeamResponse}, acima do prazo de ${deadline.rule}.`
    : "";
  return `O chamado ${number} está ${status.toLowerCase()}.${overdue} ${TEST_MODEL_NOTE}`;
}

function answerDraft(value: unknown): string {
  const draft = draftResultSchema.safeParse(value).data?.draft;
  if (!draft?.ticket) return `Não consegui montar o rascunho. ${TEST_MODEL_NOTE}`;
  return `Montei o rascunho ${draft.draftId}: ${draft.ticket.title}, prioridade ${draft.ticket.priority}. Confere e confirma? ${TEST_MODEL_NOTE}`;
}

function answerConfirmation(value: unknown): string {
  const ticket = confirmResultSchema.safeParse(value).data?.ticket;
  return ticket
    ? `Pronto, chamado ${ticket.number} criado. ${TEST_MODEL_NOTE}`
    : `Não consegui confirmar o rascunho. ${TEST_MODEL_NOTE}`;
}

function answerHandoff(value: unknown): string {
  const handoff = handoffResultSchema.safeParse(value).data?.handoff;
  return handoff
    ? `Transferi para o Suporte ${handoff.supportLevel}. Um analista fala com você até ${handoff.responseBy}. ${TEST_MODEL_NOTE}`
    : `Não consegui transferir agora. ${TEST_MODEL_NOTE}`;
}

function answerArticleSearch(value: unknown): string {
  const title = searchResultSchema.safeParse(value).data?.articles[0]?.title;
  return title
    ? `Encontrei na central de ajuda o artigo "${title}". ${TEST_MODEL_NOTE}`
    : `Não encontrei um artigo sobre isso na central de ajuda. ${TEST_MODEL_NOTE}`;
}
