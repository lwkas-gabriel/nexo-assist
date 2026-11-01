import { describe, expect, it } from "vitest";
import { agentWithTool, onTimeTicket, overdueTicket } from "./ticket.fixture.ts";
import {
  consultedTicketOf,
  emptyTicketListOf,
  isOverdueAndOpen,
  listedTicketsOf,
} from "./ticket-model.ts";

describe("chamados nas respostas do agent (tela 3)", () => {
  it("RF08: lê a lista que o agent consultou; lista vazia ou que falhou não vira seletor", () => {
    const listed = agentWithTool("1", "list_my_tickets", {
      ok: true,
      tickets: [overdueTicket, onTimeTicket],
    });

    expect(listedTicketsOf(listed)?.map((ticket) => ticket.number)).toEqual([
      "INC-20311",
      "INC-20298",
    ]);
    expect(listedTicketsOf(agentWithTool("2", "list_my_tickets", { ok: true, tickets: [] }))).toBe(
      undefined,
    );
    expect(
      listedTicketsOf(agentWithTool("3", "list_my_tickets", { ok: false, reason: "x" })),
    ).toBeUndefined();
  });

  it("RF09: lê o chamado consultado; saída fora do formato não vira card", () => {
    expect(
      consultedTicketOf(agentWithTool("1", "get_ticket", { ok: true, ticket: overdueTicket })),
    ).toEqual(overdueTicket);
    expect(
      consultedTicketOf(agentWithTool("2", "get_ticket", { ok: true, ticket: { number: "x" } })),
    ).toBeUndefined();
  });

  it("RN07: só aberto e vencido recebe a oferta de analista", () => {
    expect(isOverdueAndOpen(overdueTicket)).toBe(true);
    expect(isOverdueAndOpen(onTimeTicket)).toBe(false);
    expect(isOverdueAndOpen({ ...overdueTicket, isOpen: false })).toBe(false);
  });

  describe("emptyTicketListOf (10.5, lista vazia)", () => {
    const emptyList = (input: unknown) =>
      agentWithTool("1", "list_my_tickets", { ok: true, tickets: [] }, "", input);

    it("lê o filtro da chamada: só abertos ou todos", () => {
      expect(emptyTicketListOf(emptyList({ filter: "open" }))).toBe("open");
      expect(emptyTicketListOf(emptyList({ filter: "all" }))).toBe("all");
    });

    it("sem o filtro gravado, vale abertos (é verdade nos dois casos)", () => {
      expect(emptyTicketListOf(emptyList({}))).toBe("open");
    });

    it("lista com chamados, consulta que falhou ou outra tool não é lista vazia", () => {
      const withTickets = agentWithTool("2", "list_my_tickets", {
        ok: true,
        tickets: [overdueTicket],
      });

      expect(emptyTicketListOf(withTickets)).toBeUndefined();
      expect(
        emptyTicketListOf(
          agentWithTool("3", "list_my_tickets", { ok: false, reason: "tickets_unavailable" }),
        ),
      ).toBeUndefined();
      expect(
        emptyTicketListOf(agentWithTool("4", "get_ticket", { ok: true, tickets: [] })),
      ).toBeUndefined();
    });
  });
});
