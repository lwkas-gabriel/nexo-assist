import { randomBytes } from "node:crypto";
import { transferTicketRequestSchema, type TicketDto } from "@nexo/shared/contracts";
import { DEMO_USERS } from "@nexo/shared/demo";
import { isOpenStatus, type Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { LanguageModelV4Prompt } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { CLASSIFIER_MARKER } from "./agent/classifier.ts";
import { createMockModel } from "./agent/mock-model.ts";
import { createApp } from "./app.ts";
import { createDraftService } from "./app/draft-service.ts";
import { createHandoffService } from "./app/handoff-service.ts";
import {
  createContainer,
  type Container,
  type ContainerConfig,
  type ContainerOverrides,
} from "./container.ts";
import { createConversationStore } from "./db/conversation-store.ts";
import { openDatabase } from "./db/database.ts";
import { createDraftStore } from "./db/draft-store.ts";
import { createHandoffStore } from "./db/handoff-store.ts";
import { createUserStore } from "./db/user-store.ts";
import type { TicketGateway } from "./ports/ticket-gateway.ts";

/**
 * Config de teste: banco em memória, modelo falso e serviço de chamados fictício,
 * com token aleatório a cada execução (nenhum segredo escrito no código).
 */
export function testConfig(overrides: Partial<ContainerConfig> = {}): ContainerConfig {
  return {
    LLM_MODE: "mock",
    DATABASE_URL: ":memory:",
    TICKETS_SERVICE_URL: "http://tickets.invalid",
    TICKETS_SERVICE_TOKEN: randomBytes(32).toString("hex"),
    // Altos o bastante para não interferir; os limites têm testes próprios.
    CHAT_MESSAGES_PER_MINUTE: 1000,
    CHAT_MESSAGES_PER_DAY: 1000,
    ...overrides,
  } as ContainerConfig;
}

export function createTestContainer(overrides: ContainerOverrides = {}): Promise<Container> {
  return createContainer(testConfig(), overrides);
}

/** App de teste com um ajudante para fazer login e reaproveitar o cookie de sessão. */
export async function createTestApp(container?: Container) {
  const app = createApp(container ?? (await createTestContainer()), { cookieSecure: false });

  async function login(email: string): Promise<string> {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Qualquer senha entra na demonstração; gerada para não haver credencial escrita no código.
      body: JSON.stringify({ email, password: randomBytes(8).toString("hex") }),
    });
    if (response.status !== 200) throw new Error(`Login de teste falhou: ${response.status}`);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Login de teste sem cookie de sessão");
    return cookie;
  }

  return { app, login };
}

/**
 * Sistema de chamados falso para testes: responde só com os chamados do dono pedido, como o
 * serviço real, e registra com qual dono cada consulta foi feita (prova da RN09). As escritas
 * respeitam a chave de idempotência, como o serviço real (R01).
 */
export function createFakeTicketGateway(initialTickets: TicketDto[] = []) {
  const tickets = initialTickets.map((ticket) => ({ ...ticket, updates: [...ticket.updates] }));
  const queriedOwners: string[] = [];
  const resultsByKey = new Map<string, TicketDto>();
  const ownedBy = (ownerId: string) => tickets.filter((ticket) => ticket.ownerId === ownerId);

  function findOwned(ownerId: string, number: string): TicketDto {
    const ticket = ownedBy(ownerId).find((candidate) => candidate.number === number);
    if (!ticket) throw new AppError("NOT_FOUND", `Chamado ${number} não encontrado.`);
    return ticket;
  }

  /** Repetir a mesma chave devolve o resultado original, sem executar de novo. */
  function idempotent(key: string, write: () => TicketDto): Promise<TicketDto> {
    try {
      const result = resultsByKey.get(key) ?? write();
      resultsByKey.set(key, result);
      return Promise.resolve(structuredClone(result));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  const ticketGateway: TicketGateway = {
    listTickets: (ownerId, filter) => {
      queriedOwners.push(ownerId);
      const owned = ownedBy(ownerId);
      return Promise.resolve(
        filter === "all" ? owned : owned.filter((ticket) => isOpenStatus(ticket.status)),
      );
    },
    getTicket: (ownerId, number) => {
      queriedOwners.push(ownerId);
      const ticket = ownedBy(ownerId).find((candidate) => candidate.number === number);
      return ticket
        ? Promise.resolve(ticket)
        : Promise.reject(new AppError("NOT_FOUND", `Chamado ${number} não encontrado.`));
    },
    createTicket: (ownerId, draft, key) =>
      idempotent(key, () => {
        const prefix = draft.type === "incident" ? "INC" : "REQ";
        const now = new Date().toISOString();
        const ticket: TicketDto = {
          ...draft,
          number: `${prefix}-${20500 + tickets.length}`,
          ownerId,
          status: "new",
          createdAt: now,
          updatedAt: now,
          lastStaffUpdateAt: null,
          resolvedAt: null,
          updates: [],
        };
        tickets.push(ticket);
        return ticket;
      }),
    addUpdate: (ownerId, number, update, key) =>
      idempotent(key, () => {
        const ticket = findOwned(ownerId, number);
        ticket.updates.push({ ...update, createdAt: new Date().toISOString() });
        return ticket;
      }),
    reopenTicket: (ownerId, number, key) =>
      idempotent(key, () => {
        const ticket = findOwned(ownerId, number);
        ticket.status = "reopened";
        ticket.resolvedAt = null;
        return ticket;
      }),
    transferTicket: (ownerId, number, summary, key) =>
      idempotent(key, () => {
        // Como o serviço real: resumo fora do contrato é recusado (o gateway vê um erro interno).
        if (!transferTicketRequestSchema.safeParse({ ownerId, summary }).success) {
          throw new AppError("INTERNAL", "Resposta inesperada (HTTP 400)");
        }
        const ticket = findOwned(ownerId, number);
        ticket.status = "waiting_analyst";
        ticket.updates.push({
          author: "system",
          message: `Transferido para um analista. Resumo: ${summary}`,
          createdAt: new Date().toISOString(),
        });
        return ticket;
      }),
    assumeTicket: (ownerId, number, analystName, key) =>
      idempotent(key, () => {
        const ticket = findOwned(ownerId, number);
        if (!isOpenStatus(ticket.status)) {
          throw new AppError("CONFLICT", `O chamado ${number} não está aberto.`);
        }
        const at = new Date().toISOString();
        ticket.status = "in_service";
        ticket.lastStaffUpdateAt = at;
        ticket.updates.push({
          author: "staff",
          message: `Atendimento assumido por ${analystName}.`,
          createdAt: at,
        });
        return ticket;
      }),
  };
  return { ticketGateway, queriedOwners, tickets };
}

/**
 * Casos de uso que as tools do agent usam (rascunhos e transferência), sobre um banco em memória
 * com as pessoas de demonstração e uma conversa já aberta para o funcionário.
 */
export async function createTestAgentServices(
  ticketGateway: TicketGateway,
  clock: Clock,
  employeeId = "emp-ana-souza",
) {
  const { db } = await openDatabase(":memory:");
  await createUserStore(db).upsertAll(DEMO_USERS);
  const conversationStore = createConversationStore(db);
  const conversation = await conversationStore.create(employeeId, clock.now());
  const draftService = createDraftService({
    draftStore: createDraftStore(db),
    ticketGateway,
    clock,
  });
  const handoffStore = createHandoffStore(db);
  const handoffService = createHandoffService({
    conversationStore,
    handoffStore,
    ticketGateway,
    clock,
  });
  return {
    draftService,
    handoffService,
    handoffStore,
    conversationStore,
    conversationId: conversation.id,
  };
}

/**
 * Modelo de teste que deixa o teste agir na chamada do classificador (etapa 1): simular algo que
 * acontece enquanto ele pensa, ou fazê-lo falhar. As demais chamadas seguem o roteiro de sempre.
 */
export function mockModelWithClassifier(onClassifier: () => Promise<void> | void) {
  const scripted = createMockModel();
  const isClassifierCall = (prompt: LanguageModelV4Prompt) =>
    prompt.some(
      (message) => message.role === "system" && message.content.includes(CLASSIFIER_MARKER),
    );
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (isClassifierCall(options.prompt)) await onClassifier();
      return scripted.doGenerate(options);
    },
    doStream: async (options) => {
      if (isClassifierCall(options.prompt)) await onClassifier();
      return scripted.doStream(options);
    },
  });
}

/**
 * Modelo de teste que guarda o que o agent recebeu (contexto de sistema e histórico) e conta as
 * chamadas ao modelo, para os testes provarem o que vai e o que não vai para o LLM.
 */
export function recordingMockModel() {
  const scripted = createMockModel();
  const agentPrompts: LanguageModelV4Prompt[] = [];
  const counter = { calls: 0 };
  const record = (prompt: LanguageModelV4Prompt) => {
    counter.calls += 1;
    const isClassifier = prompt.some(
      (message) => message.role === "system" && message.content.includes(CLASSIFIER_MARKER),
    );
    if (!isClassifier) agentPrompts.push(prompt);
  };
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      record(options.prompt);
      return scripted.doGenerate(options);
    },
    doStream: (options) => {
      record(options.prompt);
      return scripted.doStream(options);
    },
  });
  /** O contexto de sistema e as mensagens que o agent recebeu na última chamada. */
  const lastAgentPrompt = () => {
    const prompt = agentPrompts.at(-1) ?? [];
    return {
      system: prompt
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n"),
      texts: prompt
        .filter((message) => message.role === "user" || message.role === "assistant")
        .flatMap((message) =>
          typeof message.content === "string"
            ? [message.content]
            : message.content.flatMap((part) => ("text" in part && part.text ? [part.text] : [])),
        ),
    };
  };
  /** Quantas chamadas foram do agent (as demais, do classificador). */
  const agentCalls = () => agentPrompts.length;
  return { model, counter, lastAgentPrompt, agentCalls };
}

/** Chamado de exemplo para testes; os campos podem ser trocados. */
export function sampleTicket(overrides: Partial<TicketDto> = {}): TicketDto {
  return {
    number: "INC-20311",
    ownerId: "emp-ana-souza",
    type: "incident",
    category: "hardware",
    priority: "medium",
    status: "waiting_analyst",
    affected: "just_me",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização do Windows.",
    createdAt: "2026-10-16T17:20:00.000Z",
    updatedAt: "2026-10-22T17:20:00.000Z",
    lastStaffUpdateAt: "2026-10-22T17:20:00.000Z",
    resolvedAt: null,
    updates: [],
    ...overrides,
  };
}
