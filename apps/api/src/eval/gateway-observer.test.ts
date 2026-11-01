import { AppError } from "@nexo/shared/errors";
import { describe, expect, it } from "vitest";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { createFakeTicketGateway, sampleTicket } from "../test-support.ts";
import { observeGateway } from "./gateway-observer.ts";

const ANA = "emp-ana-souza";
const BRUNO = "emp-bruno-tavares";
const DRAFT = {
  title: "VPN fora do ar",
  description: "A VPN não conecta desde cedo e não consigo trabalhar.",
  type: "incident",
  category: "network_vpn",
  priority: "high",
  affected: "just_me",
} as const;

function setup() {
  const { ticketGateway } = createFakeTicketGateway([sampleTicket({ ownerId: ANA })]);
  return observeGateway(ticketGateway);
}

describe("observador do sistema de chamados da avaliação", () => {
  it("RN09: registra o dono de cada consulta", async () => {
    const { gateway, accessedOwners } = setup();

    await gateway.listTickets(ANA, "open");
    await gateway.getTicket(ANA, "INC-20311");
    await expect(gateway.getTicket(BRUNO, "INC-20311")).rejects.toBeInstanceOf(AppError);

    expect(accessedOwners).toEqual([ANA, ANA, BRUNO]);
  });

  it("registra o chamado criado, com o dono que a escrita usou, e a escrita de conteúdo", async () => {
    const { gateway, createdTickets, contentWrites, accessedOwners } = setup();

    await gateway.createTicket(ANA, DRAFT, "chave-1");

    expect(accessedOwners).toEqual([ANA]);
    expect(contentWrites).toEqual([{ kind: "create", ownerId: ANA }]);
    expect(createdTickets).toEqual([
      expect.objectContaining({ ownerId: ANA, type: "incident", priority: "high" }),
    ]);
    expect(createdTickets[0]?.number).toMatch(/^INC-\d{5}$/);
  });

  it("complemento e reabertura contam como escritas de conteúdo, sem criar chamado", async () => {
    const { gateway, createdTickets, contentWrites } = setup();

    await gateway.addUpdate(
      ANA,
      "INC-20311",
      { author: "employee", message: "Mais um detalhe" },
      "chave-2",
    );
    await gateway.reopenTicket(ANA, "INC-20311", "chave-3");

    expect(contentWrites).toEqual([
      { kind: "update", ownerId: ANA },
      { kind: "reopen", ownerId: ANA },
    ]);
    expect(createdTickets).toEqual([]);
  });

  it("escrita que falha registra o acesso, mas não conta como escrita nem como chamado criado", async () => {
    const failing: TicketGateway = {
      ...createFakeTicketGateway().ticketGateway,
      createTicket: () => Promise.reject(new AppError("TICKETS_UNAVAILABLE", "instável")),
    };
    const { gateway, createdTickets, contentWrites, accessedOwners } = observeGateway(failing);

    await expect(gateway.createTicket(ANA, DRAFT, "chave-4")).rejects.toBeInstanceOf(AppError);

    expect(accessedOwners).toEqual([ANA]);
    expect(contentWrites).toEqual([]);
    expect(createdTickets).toEqual([]);
  });

  it("a transferência do chamado registra o acesso, mas não é escrita de conteúdo", async () => {
    const { gateway, contentWrites, accessedOwners } = setup();

    await gateway.transferTicket(ANA, "INC-20311", "Resumo do caso", "chave-5");

    expect(accessedOwners).toEqual([ANA]);
    expect(contentWrites).toEqual([]);
  });

  it("RN09: assumir e devolver o chamado também registram o dono", async () => {
    const { gateway, accessedOwners } = setup();

    await gateway.assumeTicket(ANA, "INC-20311", "Rafael Lima", "chave-6");
    await gateway.releaseTicket(ANA, "INC-20311", "Rafael Lima", "chave-7");

    expect(accessedOwners).toEqual([ANA, ANA]);
  });
});
