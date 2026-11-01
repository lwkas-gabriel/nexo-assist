import { INTENT_LABELS } from "../agent/classifier.ts";
import { askedQuestion, describeOverdue } from "./evaluate.ts";
import type { TurnObservation } from "./observation.ts";
import type { TurnExpectation } from "./scenario-schema.ts";

/** Frases curtas para a tabela do relatório: a ação esperada e a escolhida, lado a lado. */

const list = (items: readonly string[]) => items.join(", ");

/** Os campos definidos de uma seleção, como "incident, high". */
function values(selection: object): string {
  return Object.values(selection)
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .join(", ");
}

function describeTools(tools: NonNullable<TurnExpectation["tools"]>): string[] {
  const parts: string[] = [];
  if (tools.none) parts.push("nenhuma tool");
  if (tools.mustCall) parts.push(`chama ${list(tools.mustCall)}`);
  if (tools.mustCallOneOf) parts.push(`chama uma entre ${list(tools.mustCallOneOf)}`);
  if (tools.mustNotCall) parts.push(`não chama ${list(tools.mustNotCall)}`);
  return parts;
}

function describeDraft(draft: NonNullable<TurnExpectation["draft"]>): string {
  return draft === "none" ? "sem rascunho novo" : `rascunho novo (${values(draft)})`;
}

function describeHandoff(handoff: NonNullable<TurnExpectation["handoff"]>): string {
  if (handoff === "none") return "sem transferência";
  const details = values({ ...handoff, byCode: handoff.byCode ? "pelo código" : undefined });
  return details ? `transfere (${details})` : "transfere";
}

export function describeExpectation(expectation: TurnExpectation): string {
  const parts: string[] = [];
  if (expectation.tools) parts.push(...describeTools(expectation.tools));
  if (expectation.intent) parts.push(`entende "${INTENT_LABELS[expectation.intent]}"`);
  if (expectation.isLowConfidence !== undefined) {
    parts.push(expectation.isLowConfidence ? "confiança baixa" : "confiança não baixa");
  }
  if (expectation.asksQuestion !== undefined) {
    parts.push(expectation.asksQuestion ? "pergunta" : "não pergunta");
  }
  if (expectation.draft) parts.push(describeDraft(expectation.draft));
  if (expectation.ticketsCreated !== undefined) {
    parts.push(`${expectation.ticketsCreated} chamado(s) criado(s)`);
  }
  if (expectation.createdTicket)
    parts.push(`chamado criado (${values(expectation.createdTicket)})`);
  if (expectation.handoff) parts.push(describeHandoff(expectation.handoff));
  if (expectation.duplicateOf) parts.push(`aponta o ${expectation.duplicateOf} em vez de criar`);
  if (expectation.ticketLookup) {
    const { numbers, isOverdue } = expectation.ticketLookup;
    parts.push(`consulta ${list(numbers)}${describeOverdue(isOverdue)}`);
  }
  if (expectation.reply?.mustMatch) parts.push("texto cita o esperado");
  if (expectation.reply?.mustNotMatch) parts.push("texto sem o proibido");
  return parts.join("; ");
}

export function describeObservation(observation: TurnObservation): string {
  const tools = observation.toolCalls.map((call) =>
    call.origin === "code" ? `${call.name} (código)` : call.name,
  );
  const parts = [`tools: ${tools.length > 0 ? list(tools) : "nenhuma"}`];
  const { decision } = observation;
  if (decision) {
    parts.push(`entendeu "${decision.intentLabel}" (${decision.classifierConfidence})`);
  }
  if (askedQuestion(observation)) parts.push("perguntou");
  for (const draft of observation.newDrafts) {
    parts.push(
      `rascunho D-${draft.number} (${values({ ...draft, number: undefined, status: undefined })})`,
    );
  }
  for (const ticket of observation.createdTickets) {
    parts.push(`criou ${ticket.number} (${ticket.type}, ${ticket.priority})`);
  }
  const { handoff } = observation;
  if (handoff) {
    const origin = handoff.byCode ? ", pelo código" : "";
    parts.push(`transferiu ${handoff.supportLevel} (${handoff.reason}${origin})`);
  }
  return parts.join("; ");
}

/** Um texto por turno quando o cenário tem mais de um: "T1: ... | T2: ...". */
export function joinTurns(texts: readonly string[]): string {
  const [only] = texts;
  if (texts.length === 1 && only !== undefined) return only;
  return texts.map((text, index) => `T${index + 1}: ${text}`).join(" | ");
}
