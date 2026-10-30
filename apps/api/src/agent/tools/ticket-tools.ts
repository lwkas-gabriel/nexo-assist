import { createTool } from "@mastra/core/tools";
import { parseTicketNumber, type Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import { z } from "zod";
import type { TicketGateway } from "../../ports/ticket-gateway.ts";
import { employeeIdFrom } from "../agent-context.ts";
import { toTicketDetails, toTicketSummary } from "../ticket-view.ts";

export const LIST_MY_TICKETS_TOOL_ID = "list_my_tickets";
export const GET_TICKET_TOOL_ID = "get_ticket";

type TicketToolsDependencies = {
  ticketGateway: TicketGateway;
  clock: Clock;
};

/**
 * Falhas esperadas viram respostas que o agent explica ao funcionário, em vez de quebrar o turno.
 * "Não encontrado" cobre também o chamado de outra pessoa, sem revelar que ele existe (RN09).
 */
function toolFailure(error: unknown) {
  if (error instanceof AppError && error.code === "TICKETS_UNAVAILABLE") {
    return { ok: false as const, reason: "tickets_unavailable" as const };
  }
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return { ok: false as const, reason: "not_found" as const };
  }
  throw error;
}

/**
 * As tools não recebem quem é o funcionário: ele vem da sessão, pelo contexto do turno.
 * Assim, nem um pedido do tipo "mostre o chamado do Bruno" consegue consultar outra pessoa (RN09).
 */
export function createTicketTools({ ticketGateway, clock }: TicketToolsDependencies) {
  const listMyTickets = createTool({
    id: LIST_MY_TICKETS_TOOL_ID,
    description:
      "Lista os chamados do funcionário que está conversando, com status e prazo. Use quando ele perguntar pelos chamados dele, mesmo sem saber o número.",
    inputSchema: z.object({
      filter: z
        .enum(["open", "all"])
        .describe("open: só os chamados em andamento; all: inclui os resolvidos e cancelados"),
    }),
    execute: async ({ filter }, context) => {
      const employeeId = employeeIdFrom(context);
      try {
        const tickets = await ticketGateway.listTickets(employeeId, filter);
        const now = clock.now();
        return {
          ok: true as const,
          tickets: tickets.map((ticket) => toTicketSummary(ticket, now)),
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  });

  const getTicket = createTool({
    id: GET_TICKET_TOOL_ID,
    description:
      "Consulta um chamado do funcionário pelo número (ex.: INC-20311 ou REQ-10442): status, prazo, descrição e atualizações recentes.",
    inputSchema: z.object({
      number: z.string().min(1).max(40).describe("Número do chamado, como o funcionário escreveu"),
    }),
    execute: async ({ number }, context) => {
      const employeeId = employeeIdFrom(context);
      const ticketNumber = parseTicketNumber(number);
      if (!ticketNumber) {
        return { ok: false as const, reason: "invalid_number" as const };
      }
      try {
        const ticket = await ticketGateway.getTicket(employeeId, ticketNumber);
        return { ok: true as const, ticket: toTicketDetails(ticket, clock.now()) };
      } catch (error) {
        return toolFailure(error);
      }
    },
  });

  return { [LIST_MY_TICKETS_TOOL_ID]: listMyTickets, [GET_TICKET_TOOL_ID]: getTicket };
}
