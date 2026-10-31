import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { LOW_CONFIDENCE_THRESHOLD } from "@nexo/shared/domain";
import type { DecisionView } from "@nexo/shared/contracts";
import { z } from "zod";
import { INTENT_LABELS, type ClassificationResult } from "./classifier.ts";

/**
 * Registro de decisão de um turno (RF05): o que o classificador entendeu (etapa 1), o que o agent
 * fez (etapa 2), as regras que o código aplicou e a confiança final, ajustada por sinais (R09, R40).
 */

/** Sinais objetivos que reduzem a confiança declarada pelo classificador (R09). */
const SIGNALS = {
  classifier_unavailable: { label: "o classificador não respondeu", penalty: 0 },
  kb_without_answer: { label: "a central de ajuda não tinha artigo sobre isso", penalty: 0.2 },
  missing_fields: { label: "faltam informações para o chamado", penalty: 0.15 },
  several_duplicates: { label: "há mais de um chamado parecido", penalty: 0.15 },
  tickets_failed: { label: "o sistema de chamados falhou", penalty: 0.2 },
  action_failed: { label: "uma ação do agent falhou", penalty: 0.2 },
} as const;
export type SignalCode = keyof typeof SIGNALS;

export type DecisionStep = DecisionView["steps"][number];
export type DecisionSignal = DecisionView["signals"][number] & { code: SignalCode };

/** O registro como o contrato da tela o define, com os códigos de sinal deste módulo. */
export type DecisionTrace = Omit<DecisionView, "signals"> & { signals: DecisionSignal[] };

/** Partes das saídas das tools que o registro lê. Tudo opcional: cada tool devolve uma forma. */
const toolOutputSchema = z
  .object({
    ok: z.boolean(),
    reason: z.string(),
    articles: z.array(z.object({ title: z.string() }).partial()),
    candidates: z.array(z.unknown()),
    draft: z
      .object({ ticket: z.object({ priorityReason: z.string().nullable() }).partial() })
      .partial(),
    handoff: z.object({ supportLevel: z.string(), reason: z.string() }).nullable(),
  })
  .partial();
type ToolOutput = z.infer<typeof toolOutputSchema>;

const TICKET_FAILURES = new Set(["tickets_unavailable", "tickets_error"]);

function readOutput(output: unknown): ToolOutput {
  return toolOutputSchema.safeParse(output).data ?? {};
}

/**
 * Por que uma ação não concluiu, em português: o painel de detalhe mostra isto ao funcionário,
 * nunca o código interno. Motivo novo sem texto aqui aparece só como "não concluiu".
 */
const NOT_COMPLETED_REASONS: Record<string, string> = {
  not_found: "chamado não encontrado entre os seus",
  invalid_number: "número de chamado inválido",
  tickets_unavailable: "sistema de chamados indisponível",
  tickets_error: "erro no sistema de chamados",
  refused: "recusada pelas regras do service desk",
  cannot_reopen: "resolvido há mais de 7 dias, não dá para reabrir",
};

/** Respostas "ok: false" que são o caminho normal da conversa, e não uma falha. */
const EXPECTED_OUTCOMES: Record<string, string> = {
  incomplete: "pediu as informações que faltam",
  possible_duplicate: "apontou chamado parecido",
};

function describeOutcome(tool: string, output: ToolOutput, failed: boolean): string {
  if (failed) return "falhou";
  const expected = output.reason ? EXPECTED_OUTCOMES[output.reason] : undefined;
  if (expected) return expected;
  if (output.ok === false) {
    const reason = output.reason ? NOT_COMPLETED_REASONS[output.reason] : undefined;
    return reason ? `não concluiu: ${reason}` : "não concluiu";
  }
  if (tool === "search_knowledge_base")
    return `${output.articles?.length ?? 0} artigo(s) encontrado(s)`;
  return "concluiu";
}

function signalsOf(tool: string, output: ToolOutput): SignalCode[] {
  const signals: SignalCode[] = [];
  if (tool === "search_knowledge_base" && output.articles?.length === 0) {
    signals.push("kb_without_answer");
  }
  if (output.reason === "incomplete") signals.push("missing_fields");
  if (output.reason === "possible_duplicate" && (output.candidates?.length ?? 0) > 1) {
    signals.push("several_duplicates");
  }
  if (output.reason && TICKET_FAILURES.has(output.reason)) signals.push("tickets_failed");
  return signals;
}

/** Regras que o código aplicou neste turno, como o painel de decisão mostra. */
function rulesOf(output: ToolOutput): string[] {
  const rules: string[] = [];
  const priorityReason = output.draft?.ticket?.priorityReason;
  if (priorityReason) rules.push(priorityReason);
  if (output.handoff) {
    rules.push(`A03: ${output.handoff.reason} → Suporte ${output.handoff.supportLevel}`);
  }
  return rules;
}

/** Entradas que valem mostrar, por nome: a busca feita, o número do chamado, o filtro. */
const INPUT_SUMMARIES: Record<string, string> = {
  query: "busca",
  number: "chamado",
  filter: "filtro",
  draftId: "rascunho",
};
const INPUT_MAX_CHARS = 120;

/** "O que fiz" com a entrada resumida (10.4); texto livre longo (descrição) fica de fora. */
function summarizeInput(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const parts = Object.entries(input).flatMap(([key, value]) => {
    const label = INPUT_SUMMARIES[key];
    return label && typeof value === "string" ? [`${label}: ${value}`] : [];
  });
  const summary = parts.join(" · ");
  return summary ? summary.slice(0, INPUT_MAX_CHARS) : undefined;
}

/** A fonte da resposta: os artigos da central de ajuda que a busca trouxe. */
function articleTitles(output: ToolOutput): string[] {
  return (output.articles ?? []).flatMap((article) => (article.title ? [article.title] : []));
}

const round = (value: number) => Math.round(value * 100) / 100;

export function buildDecisionTrace(
  classification: ClassificationResult,
  response: UIMessage,
  /** Ações que o código tomou sozinho no turno, sem o agent (ex.: transferência pelo limiar). */
  codeActions: { steps: DecisionStep[]; rules: string[] } = { steps: [], rules: [] },
): DecisionTrace {
  const steps: DecisionStep[] = [...codeActions.steps];
  const rules: string[] = [...codeActions.rules];
  const codes = new Set<SignalCode>(classification.ok ? [] : ["classifier_unavailable"]);

  for (const part of response.parts.filter(isToolUIPart)) {
    const tool = getToolName(part);
    const failed = part.state === "output-error";
    const output = part.state === "output-available" ? readOutput(part.output) : {};
    const isExpected = output.reason !== undefined && output.reason in EXPECTED_OUTCOMES;
    const input = summarizeInput(part.input);
    const sources = articleTitles(output);
    steps.push({
      tool,
      ok: !failed && (output.ok !== false || isExpected),
      outcome: describeOutcome(tool, output, failed),
      ...(input ? { input } : {}),
      ...(sources.length > 0 ? { sources } : {}),
    });
    rules.push(...rulesOf(output));
    for (const code of signalsOf(tool, output)) codes.add(code);
    if (failed) codes.add("action_failed");
  }

  const signals = [...codes].map((code) => ({ code, ...SIGNALS[code] }));
  const { intent, understood, extracted, confidence, reason } = classification.classification;
  const penalty = signals.reduce((total, signal) => total + signal.penalty, 0);
  const finalConfidence = round(Math.max(0, confidence - penalty));
  return {
    intent: INTENT_LABELS[intent],
    understood,
    extracted: Object.fromEntries(
      Object.entries(extracted).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    classifierConfidence: confidence,
    confidenceSource: classification.ok ? (classification.decidedBy ?? "classifier") : "neutral",
    finalConfidence,
    isLowConfidence: finalConfidence < LOW_CONFIDENCE_THRESHOLD,
    reason,
    steps,
    rules: [...new Set(rules)],
    signals,
  };
}
