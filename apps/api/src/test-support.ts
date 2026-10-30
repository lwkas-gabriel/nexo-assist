import { randomBytes } from "node:crypto";
import type { TicketDto } from "@nexo/shared/contracts";
import { AppError } from "@nexo/shared/errors";
import { createApp } from "./app.ts";
import {
  createContainer,
  type Container,
  type ContainerConfig,
  type ContainerOverrides,
} from "./container.ts";
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
 * Sistema de chamados falso para testes: responde só com os chamados do dono pedido,
 * como o serviço real, e registra com qual dono cada consulta foi feita (prova da RN09).
 */
export function createFakeTicketGateway(tickets: TicketDto[] = []) {
  const queriedOwners: string[] = [];
  const ownedBy = (ownerId: string) => tickets.filter((ticket) => ticket.ownerId === ownerId);
  const notYetSupported = () => Promise.reject(new Error("Escrita não usada nestes testes"));

  const ticketGateway: TicketGateway = {
    listTickets: (ownerId, filter) => {
      queriedOwners.push(ownerId);
      const owned = ownedBy(ownerId);
      return Promise.resolve(
        filter === "all"
          ? owned
          : owned.filter((ticket) => !["resolved", "cancelled"].includes(ticket.status)),
      );
    },
    getTicket: (ownerId, number) => {
      queriedOwners.push(ownerId);
      const ticket = ownedBy(ownerId).find((candidate) => candidate.number === number);
      return ticket
        ? Promise.resolve(ticket)
        : Promise.reject(new AppError("NOT_FOUND", `Chamado ${number} não encontrado.`));
    },
    createTicket: notYetSupported,
    addUpdate: notYetSupported,
    reopenTicket: notYetSupported,
    transferTicket: notYetSupported,
  };
  return { ticketGateway, queriedOwners };
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
