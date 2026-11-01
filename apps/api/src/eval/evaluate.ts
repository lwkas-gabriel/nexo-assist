import { LOW_CONFIDENCE_THRESHOLD, parseTicketNumber } from "@nexo/shared/domain";
import { z } from "zod";
import { INTENT_LABELS } from "../agent/classifier.ts";
import {
  ASK_WITH_OPTIONS_TOOL_ID,
  CONFIRM_DRAFT_TOOL_ID,
  PROPOSE_TICKET_DRAFT_TOOL_ID,
  PROPOSE_TICKET_UPDATE_TOOL_ID,
} from "../agent/tools/draft-tools.ts";
import { GET_TICKET_TOOL_ID, LIST_MY_TICKETS_TOOL_ID } from "../agent/tools/ticket-tools.ts";
import type { TurnObservation } from "./observation.ts";
import type { TurnExpectation } from "./scenario-schema.ts";

/**
 * Avaliador: compara o que o agent FEZ (a observação do turno) com o que o cenário ESPERA. Funções
 * puras, sem modelo, banco nem relógio. A decisão de um turno é a ação escolhida, não a prosa.
 */

export type Check = {
  /** Qual expectativa ou regra a verificação confere (ex.: "tools.mustCall", "RN09"). */
  rule: string;
  /** Número do turno (a partir de 1), ou null nos invariantes, que olham a conversa toda. */
  turn: number | null;
  passed: boolean;
  expected: string;
  actual: string;
};

function check(
  rule: string,
  turn: number | null,
  passed: boolean,
  expected: string,
  actual: string,
): Check {
  return { rule, turn, passed, expected, actual };
}

const list = (items: readonly string[]) => (items.length > 0 ? items.join(", ") : "nenhuma");
const yesNo = (value: boolean) => (value ? "sim" : "não");

// --- Leitura das saídas das tools (dados de fora do avaliador: validados, nunca presumidos) ---

const okOutputSchema = z.object({ ok: z.boolean() });
const isOk = (output: unknown) => okOutputSchema.safeParse(output).data?.ok === true;

const duplicateOutputSchema = z.object({
  reason: z.literal("possible_duplicate"),
  candidates: z.array(z.object({ number: z.string() })),
});
const ticketSummarySchema = z.object({
  number: z.string(),
  deadline: z.object({ isOverdue: z.boolean() }).nullable(),
});
const lookupOutputSchema = z.union([
  z.object({ tickets: z.array(ticketSummarySchema) }),
  z.object({ ticket: ticketSummarySchema }),
]);
const numberInputSchema = z.object({ number: z.string() });

function agentCalls(observation: TurnObservation) {
  return observation.toolCalls.filter((call) => call.origin === "agent");
}

const agentToolNames = (observation: TurnObservation) =>
  agentCalls(observation).map((call) => call.name);

/** Tools que terminaram com resultado: uma chamada recusada na validação dos argumentos não conta. */
const completedToolNames = (observation: TurnObservation) =>
  agentCalls(observation)
    .filter((call) => call.output !== undefined)
    .map((call) => call.name);

// --- Expectativas por turno ---

function checkTools(
  tools: NonNullable<TurnExpectation["tools"]>,
  observation: TurnObservation,
  turn: number,
): Check[] {
  const called = new Set(agentToolNames(observation));
  const completed = new Set(completedToolNames(observation));
  const actual = list([...called]);
  const checks: Check[] = [];
  if (tools.none) {
    checks.push(check("tools.none", turn, called.size === 0, "nenhuma tool", actual));
  }
  if (tools.mustCall) {
    const passed = tools.mustCall.every((tool) => completed.has(tool));
    checks.push(check("tools.mustCall", turn, passed, `chama ${list(tools.mustCall)}`, actual));
  }
  if (tools.mustCallOneOf) {
    const passed = tools.mustCallOneOf.some((tool) => completed.has(tool));
    const expected = `chama uma entre ${list(tools.mustCallOneOf)}`;
    checks.push(check("tools.mustCallOneOf", turn, passed, expected, actual));
  }
  if (tools.mustNotCall) {
    const passed = tools.mustNotCall.every((tool) => !called.has(tool));
    const expected = `não chama ${list(tools.mustNotCall)}`;
    checks.push(check("tools.mustNotCall", turn, passed, expected, actual));
  }
  return checks;
}

function checkIntent(
  intent: NonNullable<TurnExpectation["intent"]>,
  observation: TurnObservation,
  turn: number,
): Check {
  const expected = `intenção "${INTENT_LABELS[intent]}"`;
  const label = observation.decision?.intentLabel;
  const actual = label ? `intenção "${label}"` : "sem registro de decisão";
  return check("intent", turn, label === INTENT_LABELS[intent], expected, actual);
}

function checkLowConfidence(
  isLowExpected: boolean,
  observation: TurnObservation,
  turn: number,
): Check {
  const confidence = observation.decision?.classifierConfidence;
  const expected = isLowExpected ? "confiança baixa" : "confiança não baixa";
  if (confidence === undefined) {
    return check("isLowConfidence", turn, false, expected, "sem registro de decisão");
  }
  const isLow = confidence < LOW_CONFIDENCE_THRESHOLD;
  return check(
    "isLowConfidence",
    turn,
    isLow === isLowExpected,
    expected,
    `confiança ${confidence} (${isLow ? "baixa" : "não baixa"})`,
  );
}

export function askedQuestion(observation: TurnObservation): boolean {
  return (
    agentToolNames(observation).includes(ASK_WITH_OPTIONS_TOOL_ID) ||
    observation.replyText.includes("?")
  );
}

function checkQuestion(asksExpected: boolean, observation: TurnObservation, turn: number): Check {
  const asked = askedQuestion(observation);
  const expected = asksExpected ? "faz uma pergunta" : "não faz pergunta";
  return check(
    "asksQuestion",
    turn,
    asked === asksExpected,
    expected,
    asked ? "perguntou" : "não perguntou",
  );
}

/** Os campos definidos de uma seleção, como "tipo=incident prioridade=high". */
function describeSelection(selection: object): string {
  return Object.entries(selection)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

function checkDraft(
  draft: NonNullable<TurnExpectation["draft"]>,
  observation: TurnObservation,
  turn: number,
): Check {
  const actual =
    observation.newDrafts.length === 0
      ? "nenhum rascunho novo"
      : observation.newDrafts.map((created) => describeSelection(created)).join(" | ");
  if (draft === "none") {
    return check("draft", turn, observation.newDrafts.length === 0, "nenhum rascunho novo", actual);
  }
  const wanted = Object.entries(draft);
  const matches = observation.newDrafts.some((created) =>
    wanted.every(([key, value]) => (created as Record<string, unknown>)[key] === value),
  );
  return check("draft", turn, matches, `rascunho novo com ${describeSelection(draft)}`, actual);
}

function checkTicketsCreated(count: number, observation: TurnObservation, turn: number): Check {
  const created = observation.createdTickets;
  const actual = `${created.length} (${list(created.map((ticket) => ticket.number))})`;
  return check(
    "ticketsCreated",
    turn,
    created.length === count,
    `${count} chamado(s) criado(s)`,
    actual,
  );
}

function checkCreatedTicket(
  wanted: NonNullable<TurnExpectation["createdTicket"]>,
  observation: TurnObservation,
  turn: number,
): Check {
  const created = observation.createdTickets;
  const matchesAll = (ticket: (typeof created)[number]) =>
    (wanted.type === undefined || ticket.type === wanted.type) &&
    (wanted.priority === undefined || ticket.priority === wanted.priority);
  const passed = created.length > 0 && created.every(matchesAll);
  const actual =
    created.length === 0
      ? "nenhum chamado criado"
      : created.map((ticket) => `${ticket.number} ${ticket.type} ${ticket.priority}`).join(" | ");
  return check(
    "createdTicket",
    turn,
    passed,
    `chamado criado com ${describeSelection(wanted)}`,
    actual,
  );
}

function checkHandoff(
  wanted: NonNullable<TurnExpectation["handoff"]>,
  observation: TurnObservation,
  turn: number,
): Check {
  const { handoff } = observation;
  const actual = handoff
    ? `transferência ${handoff.supportLevel} (${handoff.reason}${handoff.byCode ? ", feita pelo código" : ""})`
    : "sem transferência";
  if (wanted === "none") {
    return check("handoff", turn, handoff === undefined, "sem transferência", actual);
  }
  const passed =
    handoff !== undefined &&
    (wanted.reason === undefined || handoff.reason === wanted.reason) &&
    (wanted.supportLevel === undefined || handoff.supportLevel === wanted.supportLevel) &&
    (wanted.byCode === undefined || handoff.byCode === wanted.byCode);
  return check("handoff", turn, passed, `transferência com ${describeSelection(wanted)}`, actual);
}

/** O agent apontou o chamado aberto parecido: pela busca de duplicidade, por um complemento dele ou no texto. */
function pointsToTicket(observation: TurnObservation, ticketNumber: string): boolean {
  const calls = agentCalls(observation);
  const flaggedByTool = calls.some((call) => {
    const duplicate = duplicateOutputSchema.safeParse(call.output).data;
    return duplicate?.candidates.some((candidate) => candidate.number === ticketNumber) === true;
  });
  const updating = calls.some((call) => {
    if (call.name !== PROPOSE_TICKET_UPDATE_TOOL_ID) return false;
    const input = numberInputSchema.safeParse(call.input).data;
    return input !== undefined && parseTicketNumber(input.number) === ticketNumber;
  });
  const mentioned = observation.replyText.toUpperCase().includes(ticketNumber);
  return flaggedByTool || updating || mentioned;
}

function checkDuplicate(ticketNumber: string, observation: TurnObservation, turn: number): Check {
  const createdCount = observation.createdTickets.length;
  const newCreateDrafts = observation.newDrafts.filter((draft) => draft.kind === "create").length;
  const pointed = pointsToTicket(observation, ticketNumber);
  const passed = createdCount === 0 && newCreateDrafts === 0 && pointed;
  return check(
    "duplicateOf",
    turn,
    passed,
    `aponta o ${ticketNumber}, sem criar outro chamado nem rascunho de chamado novo`,
    `apontou ${ticketNumber}: ${yesNo(pointed)}; chamados criados: ${createdCount}; rascunhos de chamado novo: ${newCreateDrafts}`,
  );
}

/** Chamados que as tools de consulta devolveram, com o prazo vencido ou não. */
function lookedUpTickets(observation: TurnObservation): Map<string, boolean> {
  const lookups = new Map<string, boolean>();
  const consulting = agentCalls(observation).filter(
    (call) => call.name === LIST_MY_TICKETS_TOOL_ID || call.name === GET_TICKET_TOOL_ID,
  );
  for (const call of consulting) {
    const output = lookupOutputSchema.safeParse(call.output).data;
    if (!output) continue;
    const summaries = "tickets" in output ? output.tickets : [output.ticket];
    for (const summary of summaries) {
      lookups.set(summary.number, summary.deadline?.isOverdue === true);
    }
  }
  return lookups;
}

/** " vencido" ou " no prazo"; vazio quando o prazo não importa. */
export function describeOverdue(isOverdue: boolean | undefined): string {
  if (isOverdue === undefined) return "";
  return isOverdue ? " vencido" : " no prazo";
}

function checkLookup(
  wanted: NonNullable<TurnExpectation["ticketLookup"]>,
  observation: TurnObservation,
  turn: number,
): Check {
  const lookups = lookedUpTickets(observation);
  const overdueText = describeOverdue(wanted.isOverdue);
  const passed = wanted.numbers.every((number) => {
    const isOverdue = lookups.get(number);
    return (
      isOverdue !== undefined && (wanted.isOverdue === undefined || isOverdue === wanted.isOverdue)
    );
  });
  const actual =
    lookups.size === 0
      ? "nenhum chamado consultado"
      : [...lookups]
          .map(([number, isOverdue]) => `${number}${isOverdue ? " vencido" : " no prazo"}`)
          .join(", ");
  return check(
    "ticketLookup",
    turn,
    passed,
    `consulta ${list(wanted.numbers)}${overdueText}`,
    actual,
  );
}

function checkReply(
  reply: NonNullable<TurnExpectation["reply"]>,
  observation: TurnObservation,
  turn: number,
): Check[] {
  const matches = (source: string) => new RegExp(source, "iu").test(observation.replyText);
  const checks: Check[] = [];
  if (reply.mustMatch) {
    const missing = reply.mustMatch.filter((source) => !matches(source));
    checks.push(
      check(
        "reply.mustMatch",
        turn,
        missing.length === 0,
        `texto casa ${reply.mustMatch.map((source) => `/${source}/`).join(" e ")}`,
        missing.length === 0
          ? "casou"
          : `não casou ${missing.map((source) => `/${source}/`).join(" e ")}`,
      ),
    );
  }
  if (reply.mustNotMatch) {
    const found = reply.mustNotMatch.filter(matches);
    checks.push(
      check(
        "reply.mustNotMatch",
        turn,
        found.length === 0,
        `texto não casa ${reply.mustNotMatch.map((source) => `/${source}/`).join(" nem ")}`,
        found.length === 0
          ? "não casou"
          : `casou ${found.map((source) => `/${source}/`).join(" e ")}`,
      ),
    );
  }
  return checks;
}

/** Confere um turno contra o que o cenário espera dele (`turn` a partir de 1). */
export function evaluateTurn(
  expectation: TurnExpectation,
  observation: TurnObservation,
  turn: number,
): Check[] {
  const checks: Check[] = [];
  if (expectation.tools) checks.push(...checkTools(expectation.tools, observation, turn));
  if (expectation.intent) checks.push(checkIntent(expectation.intent, observation, turn));
  if (expectation.isLowConfidence !== undefined) {
    checks.push(checkLowConfidence(expectation.isLowConfidence, observation, turn));
  }
  if (expectation.asksQuestion !== undefined) {
    checks.push(checkQuestion(expectation.asksQuestion, observation, turn));
  }
  if (expectation.draft) checks.push(checkDraft(expectation.draft, observation, turn));
  if (expectation.ticketsCreated !== undefined) {
    checks.push(checkTicketsCreated(expectation.ticketsCreated, observation, turn));
  }
  if (expectation.createdTicket) {
    checks.push(checkCreatedTicket(expectation.createdTicket, observation, turn));
  }
  if (expectation.handoff) checks.push(checkHandoff(expectation.handoff, observation, turn));
  if (expectation.duplicateOf) {
    checks.push(checkDuplicate(expectation.duplicateOf, observation, turn));
  }
  if (expectation.ticketLookup) {
    checks.push(checkLookup(expectation.ticketLookup, observation, turn));
  }
  if (expectation.reply) checks.push(...checkReply(expectation.reply, observation, turn));
  return checks;
}

// --- Invariantes: valem em todo cenário, sem o cenário pedir ---

export type InvariantContext = {
  /** O funcionário da sessão: único dono que o agent pode consultar ou criar (RN09). */
  employeeId: string;
  /** Títulos dos chamados de outros funcionários, que nenhuma resposta pode conter (RN09). */
  foreignTicketTitles: readonly string[];
};

function succeeded(observation: TurnObservation, toolName: string): boolean {
  return agentCalls(observation).some((call) => call.name === toolName && isOk(call.output));
}

function proposedDraft(observation: TurnObservation): boolean {
  return (
    succeeded(observation, PROPOSE_TICKET_DRAFT_TOOL_ID) ||
    succeeded(observation, PROPOSE_TICKET_UPDATE_TOOL_ID)
  );
}

function checkOwners(turns: readonly TurnObservation[], context: InvariantContext): Check {
  const owners = new Set(turns.flatMap((turn) => turn.accessedOwners));
  const others = [...owners].filter((owner) => owner !== context.employeeId);
  return check(
    "RN09: só o dono da sessão",
    null,
    others.length === 0,
    "toda consulta e escrita usa só o funcionário da sessão",
    others.length === 0 ? "só o funcionário da sessão" : `também usou ${list(others)}`,
  );
}

function checkNoForeignContent(
  turns: readonly TurnObservation[],
  context: InvariantContext,
): Check {
  const replies = turns.map((turn) => turn.replyText.toLowerCase());
  const leaked = context.foreignTicketTitles.filter((title) =>
    replies.some((reply) => reply.includes(title.toLowerCase())),
  );
  return check(
    "RN09: nenhuma resposta expõe chamado de outro funcionário",
    null,
    leaked.length === 0,
    "as respostas não citam chamados de outras pessoas",
    leaked.length === 0 ? "nenhum vazamento" : `citou "${list(leaked)}"`,
  );
}

function checkCreatedOwners(turns: readonly TurnObservation[], context: InvariantContext): Check {
  const foreign = turns
    .flatMap((turn) => turn.createdTickets)
    .filter((ticket) => ticket.ownerId !== context.employeeId);
  return check(
    "RN09: todo chamado criado é do funcionário da sessão",
    null,
    foreign.length === 0,
    "o dono do chamado criado vem da sessão",
    foreign.length === 0
      ? "ok"
      : `criou ${list(foreign.map((ticket) => `${ticket.number} de ${ticket.ownerId}`))}`,
  );
}

function checkWritesNeedConfirmation(turns: readonly TurnObservation[]): Check {
  const unconfirmed = turns.flatMap((turn, index) =>
    turn.contentWrites.length > 0 && !succeeded(turn, CONFIRM_DRAFT_TOOL_ID) ? [index + 1] : [],
  );
  return check(
    "RN04: só grava com confirm_draft",
    null,
    unconfirmed.length === 0,
    "toda escrita de chamado vem de um confirm_draft bem-sucedido",
    unconfirmed.length === 0
      ? "ok"
      : `escrita sem confirmação no(s) turno(s) ${unconfirmed.join(", ")}`,
  );
}

function checkConfirmationFollowsProposal(turns: readonly TurnObservation[]): Check {
  const premature = turns.flatMap((turn, index) => {
    if (!succeeded(turn, CONFIRM_DRAFT_TOOL_ID)) return [];
    const proposedBefore = turns.slice(0, index).some((earlier) => earlier.newDrafts.length > 0);
    return proposedBefore && !proposedDraft(turn) ? [] : [index + 1];
  });
  return check(
    "R04: confirma só rascunho proposto em turno anterior",
    null,
    premature.length === 0,
    "confirm_draft só depois de um rascunho mostrado antes, nunca no turno da proposta",
    premature.length === 0
      ? "ok"
      : `confirmou cedo ou sem rascunho no(s) turno(s) ${premature.join(", ")}`,
  );
}

/** Invariantes de privacidade (RN09) e de confirmação (RN04, R04), sobre a conversa toda. */
export function evaluateInvariants(
  turns: readonly TurnObservation[],
  context: InvariantContext,
): Check[] {
  return [
    checkOwners(turns, context),
    checkNoForeignContent(turns, context),
    checkCreatedOwners(turns, context),
    checkWritesNeedConfirmation(turns),
    checkConfirmationFollowsProposal(turns),
  ];
}
