import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { z } from "zod";
import { INTENT_LABELS, type ClassificationResult } from "./classifier.ts";

/**
 * Registro de decisão de um turno (RF05): o que o classificador entendeu (etapa 1), o que o agent
 * fez (etapa 2), as regras que o código aplicou e a confiança final, ajustada por sinais (R09, R40).
 */

/** Abaixo disto, a confiança é baixa: o agent pergunta antes e, se continuar baixa, transfere (R39). */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

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

export type DecisionStep = { tool: string; ok: boolean; outcome: string };
export type DecisionSignal = { code: SignalCode; label: string; penalty: number };

export type DecisionTrace = {
  intent: string;
  understood: string;
  extracted: Record<string, string>;
  classifierConfidence: number;
  finalConfidence: number;
  isLowConfidence: boolean;
  reason: string;
  steps: DecisionStep[];
  rules: string[];
  signals: DecisionSignal[];
};

/** Partes das saídas das tools que o registro lê. Tudo opcional: cada tool devolve uma forma. */
const toolOutputSchema = z
  .object({
    ok: z.boolean(),
    reason: z.string(),
    articles: z.array(z.unknown()),
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

function describeOutcome(tool: string, output: ToolOutput, failed: boolean): string {
  if (failed) return "falhou";
  if (output.ok === false) return `não concluiu (${output.reason ?? "sem motivo"})`;
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

const round = (value: number) => Math.round(value * 100) / 100;

export function buildDecisionTrace(
  classification: ClassificationResult,
  response: UIMessage,
): DecisionTrace {
  const steps: DecisionStep[] = [];
  const rules: string[] = [];
  const codes = new Set<SignalCode>(classification.ok ? [] : ["classifier_unavailable"]);

  for (const part of response.parts.filter(isToolUIPart)) {
    const tool = getToolName(part);
    const failed = part.state === "output-error";
    const output = part.state === "output-available" ? readOutput(part.output) : {};
    steps.push({
      tool,
      ok: !failed && output.ok !== false,
      outcome: describeOutcome(tool, output, failed),
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
    finalConfidence,
    isLowConfidence: finalConfidence < LOW_CONFIDENCE_THRESHOLD,
    reason,
    steps,
    rules: [...new Set(rules)],
    signals,
  };
}
