import { decisionViewSchema, type DecisionView } from "@nexo/shared/contracts";
import { AFFECTED_SCOPE_LABELS, TICKET_CATEGORY_LABELS, URGENCY_LABELS } from "@nexo/shared/domain";
import type { UIMessage } from "ai";
import { describeToolAction } from "./tool-actions.ts";

/**
 * Leitura do registro de decisão (RF05) para o painel de detalhe, sem React. O registro chega
 * nos metadados da resposta, depois que ela é gravada; durante o streaming ainda não existe.
 */

/** O registro de decisão da mensagem, se veio e é válido. */
export function decisionOf(message: UIMessage): DecisionView | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("decision" in metadata)) {
    return undefined;
  }
  const parsed = decisionViewSchema.safeParse(metadata.decision);
  return parsed.success ? parsed.data : undefined;
}

type FieldReader = { label: string; read: (code: string) => string | undefined };

/** Os campos que o classificador extrai, com os mesmos rótulos que o card do rascunho usa. */
const EXTRACTED_FIELDS: Record<string, FieldReader> = {
  ticketNumber: { label: "Chamado", read: (value) => value },
  category: { label: "Categoria", read: (code) => labelOf(TICKET_CATEGORY_LABELS, code) },
  affected: { label: "Quem é afetado", read: (code) => labelOf(AFFECTED_SCOPE_LABELS, code) },
  urgency: { label: "Urgência", read: (code) => labelOf(URGENCY_LABELS, code) },
};

function labelOf(labels: Record<string, string>, code: string): string | undefined {
  return Object.hasOwn(labels, code) ? labels[code] : undefined;
}

/** "O que entendi": campo e valor em português; código desconhecido fica de fora. */
export function extractedFields(decision: DecisionView): { label: string; value: string }[] {
  return Object.entries(decision.extracted).flatMap(([key, code]) => {
    const field = EXTRACTED_FIELDS[key];
    const value = field?.read(code);
    return field && value ? [{ label: field.label, value }] : [];
  });
}

/** Passos que o código executou sozinho, sem o agent (11.5); o resto é tool do agent. */
const CODE_STEP_LABELS: Record<string, string> = {
  draft_button: "botão do card do rascunho",
  analyst_button: 'botão "Falar com um analista"',
  ticket_selection: "escolha na lista de chamados",
};

/** "O que fiz": o mesmo texto do chip, ou o nome do botão quando a ação foi do código. */
export function stepLabel(tool: string): string {
  return CODE_STEP_LABELS[tool] ?? describeToolAction(tool);
}

/** Se a ação foi decidida por um botão, sem o modelo (confiança 100% por construção). */
export function isCodeDecision(decision: DecisionView): boolean {
  return decision.steps.some((step) => step.tool in CODE_STEP_LABELS);
}

export function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}
