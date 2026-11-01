import { randomBytes } from "node:crypto";
import type { MastraModelConfig } from "@mastra/core/llm";
import { decisionViewSchema, type DecisionView } from "@nexo/shared/contracts";
import { DEMO_USERS } from "@nexo/shared/demo";
import { getToolName, isToolUIPart, type UIMessage, type UIMessageChunk } from "ai";
import { z } from "zod";
import { classifyProviderError, captureProviderFailures } from "./provider-errors.ts";
import { QUOTA_EXCEEDED_MESSAGE } from "../agent/agent-errors.ts";
import { textOf } from "../app/chat-text.ts";
import type { ContainerConfig } from "../container.ts";
import { createContainer, type Container } from "../container.ts";
import type { LlmConfig } from "../config.ts";
import { createDraftStore, type Draft } from "../db/draft-store.ts";
import { createHandoffStore } from "../db/handoff-store.ts";
import type { UserRow } from "../db/schema.ts";
import { createFakeTicketGateway } from "../test-support.ts";
import { observeGateway } from "./gateway-observer.ts";
import { buildEvalTickets } from "./fixtures.ts";
import type {
  DecisionObservation,
  DraftObservation,
  HandoffObservation,
  ObservedTurn,
  ToolCallObservation,
  TurnFailure,
  TurnObservation,
} from "./observation.ts";
import { AGENT_TOOL_IDS, type EvalScenario } from "./scenario-schema.ts";
import { createSteppingClock, type SteppingClock } from "./stepping-clock.ts";

/**
 * Executor: monta o agent REAL do produto (o container, com o caso de uso do chat, o classificador,
 * o registro de decisão e as tools) sobre portas de teste e banco em memória, sem subir servidor.
 * A única chamada de rede possível é a do modelo, e só no modo gemini.
 */

/** Terça-feira, 15h em Brasília: horário útil, então os prazos (RN12) são previsíveis. */
export const EVAL_CLOCK_START = new Date("2026-10-27T18:00:00Z");
/** Tempo que o funcionário leva para escrever a mensagem seguinte. */
const EMPLOYEE_PAUSE_MS = 60 * 1000;
const EVAL_CLIENT_IP = "avaliacao";
/**
 * Os limites de uso do produto (por minuto, por dia) não medem decisões; quem protege a cota do
 * modelo real é o espaçamento do executor (run-evaluation.ts).
 */
const NO_PRODUCT_LIMIT = 1_000_000;

function containerConfig(llm: LlmConfig): ContainerConfig {
  return {
    ...llm,
    DATABASE_URL: ":memory:",
    // Nunca acessados: o sistema de chamados é a porta de teste. Token aleatório, sem segredo no código.
    TICKETS_SERVICE_URL: "http://tickets.invalid",
    TICKETS_SERVICE_TOKEN: randomBytes(32).toString("hex"),
    CHAT_MESSAGES_PER_MINUTE: NO_PRODUCT_LIMIT,
    CHAT_MESSAGES_PER_DAY: NO_PRODUCT_LIMIT,
  };
}

type Session = {
  container: Container;
  employee: UserRow;
  clock: SteppingClock;
  gateway: ReturnType<typeof observeGateway>;
};

/** O que já existia antes do turno, para o turno enxergar só o que ele próprio produziu. */
type Snapshot = {
  messageIds: Set<string>;
  draftNumbers: Set<number>;
  handoffId: string | undefined;
  accessedOwners: number;
  contentWrites: number;
  createdTickets: number;
};

async function takeSnapshot(session: Session): Promise<Snapshot> {
  const { container, employee, gateway } = session;
  const view = await container.chatService.getConversation(employee);
  const conversationId = view.conversation?.id;
  const handoff = conversationId
    ? await createHandoffStore(container.db).latestForConversation(conversationId)
    : undefined;
  return {
    messageIds: new Set(view.messages.map((message) => message.id)),
    draftNumbers: new Set(view.drafts.map((draft) => draft.number)),
    handoffId: handoff?.id,
    accessedOwners: gateway.accessedOwners.length,
    contentWrites: gateway.contentWrites.length,
    createdTickets: gateway.createdTickets.length,
  };
}

/** Sem o erro original (só o texto que o funcionário veria), só a cota é reconhecível. */
function toFailure(errorText: string, original: unknown): TurnFailure {
  if (original !== undefined) return { kind: classifyProviderError(original), detail: errorText };
  return { kind: errorText === QUOTA_EXCEEDED_MESSAGE ? "quota" : "other", detail: errorText };
}

/** Lê a resposta até o fim; o produto devolve falhas do modelo como pedaços de erro do stream. */
async function drain(stream: ReadableStream<UIMessageChunk>): Promise<string | undefined> {
  let errorText: string | undefined;
  const reader = stream.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    if (chunk.value.type === "error") errorText ??= chunk.value.errorText;
  }
  return errorText;
}

const authorMetadataSchema = z.object({ author: z.string() });
const authorOf = (message: UIMessage) =>
  authorMetadataSchema.safeParse(message.metadata).data?.author;

const decisionMetadataSchema = z.object({ decision: decisionViewSchema });

function decisionOf(message: UIMessage): DecisionView | undefined {
  return decisionMetadataSchema.safeParse(message.metadata).data?.decision;
}

function agentToolCalls(messages: readonly UIMessage[]): ToolCallObservation[] {
  return messages.flatMap((message) =>
    message.parts.filter(isToolUIPart).map((part) => ({
      name: getToolName(part),
      origin: "agent" as const,
      input: part.input,
      output: part.state === "output-available" ? part.output : undefined,
    })),
  );
}

/** Passos do registro de decisão sem tool do agent por trás: ações que o próprio código tomou (R39). */
function codeToolCalls(
  decision: DecisionView | undefined,
  agentCalls: readonly ToolCallObservation[],
): ToolCallObservation[] {
  const agentNames = new Set(agentCalls.map((call) => call.name));
  const knownTools: readonly string[] = AGENT_TOOL_IDS;
  return (decision?.steps ?? [])
    .filter((step) => knownTools.includes(step.tool) && !agentNames.has(step.tool))
    .map((step) => ({
      name: step.tool,
      origin: "code" as const,
      input: undefined,
      output: undefined,
    }));
}

function toDecisionObservation(decision: DecisionView): DecisionObservation {
  return {
    intentLabel: decision.intent,
    classifierConfidence: decision.classifierConfidence,
    isClassifierAvailable: !decision.signals.some(
      (signal) => signal.code === "classifier_unavailable",
    ),
  };
}

function toDraftObservation(draft: Draft): DraftObservation {
  const base = {
    number: draft.number,
    kind: draft.kind,
    status: draft.status,
    ticketNumber: draft.ticketNumber,
  };
  if (draft.kind !== "create") return base;
  const { type, priority, category, affected } = draft.content;
  return { ...base, type, priority, category, affected };
}

async function observeTurn(session: Session, before: Snapshot): Promise<TurnObservation> {
  const { container, employee, gateway } = session;
  const view = await container.chatService.getConversation(employee);
  const conversationId = view.conversation?.id;
  const replies = view.messages.filter(
    (message) => message.role === "assistant" && !before.messageIds.has(message.id),
  );
  const agentCalls = agentToolCalls(replies);
  // Um turno tem um registro de decisão (o da resposta do agent ou o do aviso do código).
  const decision = replies.map(decisionOf).find((found) => found !== undefined);

  const drafts = conversationId
    ? await createDraftStore(container.db).listByConversation(conversationId)
    : [];
  const handoffRow = conversationId
    ? await createHandoffStore(container.db).latestForConversation(conversationId)
    : undefined;
  const handoff: HandoffObservation | undefined =
    handoffRow && handoffRow.id !== before.handoffId
      ? {
          reason: handoffRow.reason,
          supportLevel: handoffRow.supportLevel,
          byCode: !agentCalls.some((call) => call.name === "handoff_to_analyst"),
        }
      : undefined;

  return {
    replyText: replies.map((message) => textOf(message.parts)).join("\n"),
    agentText: replies
      .filter((message) => authorOf(message) === "agent")
      .map((message) => textOf(message.parts))
      .join("\n"),
    toolCalls: [...agentCalls, ...codeToolCalls(decision, agentCalls)],
    decision: decision ? toDecisionObservation(decision) : undefined,
    newDrafts: drafts
      .filter((draft) => !before.draftNumbers.has(draft.number))
      .map(toDraftObservation),
    createdTickets: gateway.createdTickets.slice(before.createdTickets),
    contentWrites: gateway.contentWrites.slice(before.contentWrites),
    accessedOwners: gateway.accessedOwners.slice(before.accessedOwners),
    handoff,
  };
}

async function openSession(
  scenario: EvalScenario,
  llm: LlmConfig,
  model: MastraModelConfig | undefined,
): Promise<Session> {
  const clock = createSteppingClock(EVAL_CLOCK_START);
  const fake = createFakeTicketGateway(buildEvalTickets(EVAL_CLOCK_START), clock);
  const gateway = observeGateway(fake.ticketGateway);
  const container = await createContainer(containerConfig(llm), {
    clock,
    ticketGateway: gateway.gateway,
    ...(model ? { model } : {}),
  });
  const persona = DEMO_USERS.find((user) => user.id === scenario.employeeId);
  if (!persona) throw new Error(`Funcionário de demonstração inexistente: ${scenario.employeeId}`);
  // Qualquer senha entra na demonstração; gerada para não haver credencial escrita no código.
  const { user } = await container.authService.login({
    email: persona.email,
    password: randomBytes(8).toString("hex"),
    remember: false,
  });
  return { container, employee: user, clock, gateway };
}

async function playTurn(session: Session, message: string): Promise<ObservedTurn> {
  const before = await takeSnapshot(session);
  session.clock.advance(EMPLOYEE_PAUSE_MS);
  let failure: TurnFailure | undefined;
  const { failures } = await captureProviderFailures(async () => {
    try {
      const stream = await session.container.chatService.sendMessage(session.employee, message, {
        ip: EVAL_CLIENT_IP,
      });
      const errorText = await drain(stream);
      if (errorText !== undefined) failure = toFailure(errorText, undefined);
    } catch (error) {
      // Erro tipado do produto (ex.: limite da sessão): a mensagem já é a que o funcionário veria.
      failure = { kind: "other", detail: error instanceof Error ? error.message : String(error) };
    }
  });
  if (failure && failures.agent !== undefined) {
    failure = { ...failure, kind: classifyProviderError(failures.agent) };
  }
  const classifierFailure: TurnFailure | undefined =
    failures.classifier === undefined
      ? undefined
      : { kind: classifyProviderError(failures.classifier), detail: "o classificador falhou" };
  return { message, observation: await observeTurn(session, before), failure, classifierFailure };
}

export type ScenarioPlay = {
  /** Os turnos jogados; para no primeiro que falhou (os seguintes não fariam sentido). */
  turns: ObservedTurn[];
};

/**
 * Joga as mensagens do cenário, uma por turno, no agent real. `beforeMessage` é chamado antes de
 * cada mensagem: é onde o orquestrador espaça e conta as chamadas ao modelo (ADR-0010).
 */
export async function playScenario(
  scenario: EvalScenario,
  options: {
    llm: LlmConfig;
    /** Só os testes trocam o modelo (um que falha, por exemplo); a avaliação usa o da config. */
    model?: MastraModelConfig;
    beforeMessage: () => Promise<void>;
  },
): Promise<ScenarioPlay> {
  const session = await openSession(scenario, options.llm, options.model);
  const turns: ObservedTurn[] = [];
  for (const { message } of scenario.turns) {
    await options.beforeMessage();
    const turn = await playTurn(session, message);
    turns.push(turn);
    if (turn.failure || turn.classifierFailure) break;
  }
  return { turns };
}
