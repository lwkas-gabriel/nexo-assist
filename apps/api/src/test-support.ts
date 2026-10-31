import { randomBytes } from "node:crypto";
import type { TicketDto } from "@nexo/shared/contracts";
import { DEMO_USERS } from "@nexo/shared/demo";
import { isOpenStatus, type Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import { createApp } from "./app.ts";
import { createDraftService } from "./app/draft-service.ts";
import {
  createContainer,
  type Container,
  type ContainerConfig,
  type ContainerOverrides,
} from "./container.ts";
import { createConversationStore } from "./db/conversation-store.ts";
import { openDatabase } from "./db/database.ts";
import { createDraftStore } from "./db/draft-store.ts";
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
      body: JSON.stringify({ email, password: "qualquer-senha" }),
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
  const notYetSupported = () => Promise.reject(new Error("Escrita não usada nestes testes"));

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
    transferTicket: notYetSupported,
  };
  return { ticketGateway, queriedOwners, tickets };
}

/**
 * Caso de uso de rascunhos sobre um banco em memória, com as pessoas de demonstração e uma
 * conversa já aberta para o funcionário (os rascunhos pertencem a uma conversa).
 */
export async function createTestDraftService(
  ticketGateway: TicketGateway,
  clock: Clock,
  employeeId = "emp-ana-souza",
) {
  const { db } = await openDatabase(":memory:");
  await createUserStore(db).upsertAll(DEMO_USERS);
  const conversation = await createConversationStore(db).create(employeeId, clock.now());
  const draftService = createDraftService({
    draftStore: createDraftStore(db),
    ticketGateway,
    clock,
  });
  return { draftService, conversationId: conversation.id };
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
