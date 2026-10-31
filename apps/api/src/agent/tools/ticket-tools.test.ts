import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@nexo/shared/errors";
import { describe, expect, it } from "vitest";
import type { TicketGateway } from "../../ports/ticket-gateway.ts";
import { createFakeTicketGateway, sampleTicket } from "../../test-support.ts";
import { createAgentRequestContext } from "../agent-context.ts";
import { createTicketTools } from "./ticket-tools.ts";

const ANA = "emp-ana-souza";
const clock = { now: () => new Date("2026-10-27T18:00:00Z") };

/** Chama a tool como o agent chamaria: com o funcionário da sessão no contexto do turno. */
function callTools(
  ticketGateway: TicketGateway,
  requestContext: RequestContext = createAgentRequestContext(ANA),
) {
  const tools = createTicketTools({ ticketGateway, clock });
  return {
    listMyTickets: (filter: "open" | "all") =>
      tools.list_my_tickets.execute?.({ filter }, { requestContext }),
    getTicket: (number: string) => tools.get_ticket.execute?.({ number }, { requestContext }),
  };
}

describe("tools de chamados", () => {
  it("consulta pelo número escrito de qualquer jeito, sempre com o dono da sessão", async () => {
    const { ticketGateway, queriedOwners } = createFakeTicketGateway([sampleTicket()]);

    const result = await callTools(ticketGateway).getTicket("inc 20311");

    expect(result).toMatchObject({ ok: true, ticket: { number: "INC-20311" } });
    expect(queriedOwners).toEqual([ANA]);
  });

  it("número inválido não chega a consultar o sistema de chamados", async () => {
    const { ticketGateway, queriedOwners } = createFakeTicketGateway();

    const result = await callTools(ticketGateway).getTicket("meu chamado de ontem");

    expect(result).toEqual({ ok: false, reason: "invalid_number" });
    expect(queriedOwners).toEqual([]);
  });

  it("falha inesperada do sistema de chamados vira 'tickets_error', sem detalhes internos", async () => {
    const broken: TicketGateway = {
      ...createFakeTicketGateway().ticketGateway,
      listTickets: () => Promise.reject(new AppError("INTERNAL", "Resposta inesperada (HTTP 401)")),
    };

    const result = await callTools(broken).listMyTickets("open");

    expect(result).toEqual({ ok: false, reason: "tickets_error" });
  });

  it("falha fechada: sem funcionário no contexto, recusa e não consulta ninguém", async () => {
    const { ticketGateway, queriedOwners } = createFakeTicketGateway([sampleTicket()]);

    const call = callTools(ticketGateway, new RequestContext()).listMyTickets("open");

    await expect(call).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(queriedOwners).toEqual([]);
  });
});
