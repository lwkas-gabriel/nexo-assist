import { describe, expect, it } from "vitest";
import { sampleTicket } from "../test-support.ts";
import { toTicketDetails, toTicketSummary } from "./ticket-view.ts";

// Terça, 27/10 às 15h em Brasília.
const NOW = new Date("2026-10-27T18:00:00Z");

describe("toTicketSummary", () => {
  it("RN12: traz o prazo já calculado, em Brasília, e se venceu (cenário da tela 3)", () => {
    // Média (3 dias úteis), última atualização da TI na quinta 22/10 às 14:20.
    const summary = toTicketSummary(sampleTicket(), NOW);

    expect(summary).toMatchObject({
      number: "INC-20311",
      status: "Aguardando analista",
      category: "Hardware",
      priority: "Média",
      isOpen: true,
      lastTeamUpdateAt: "22/10, 14:20",
      daysWithoutTeamUpdate: 5,
      deadline: { rule: "3 dias úteis", dueAt: "27/10, 14:20", isOverdue: true },
    });
  });

  it("chamado resolvido não tem prazo e diz se ainda pode ser reaberto (RN06)", () => {
    const resolved = sampleTicket({
      status: "resolved",
      resolvedAt: "2026-10-23T17:00:00.000Z",
    });

    expect(toTicketSummary(resolved, NOW)).toMatchObject({
      isOpen: false,
      deadline: null,
      canReopen: true,
    });
  });
});

describe("toTicketDetails", () => {
  it("mostra só as atualizações recentes, dizendo quem escreveu", () => {
    const updates = Array.from({ length: 7 }, (_, index) => ({
      author: "staff" as const,
      message: `atualização ${index + 1}`,
      createdAt: "2026-10-20T13:00:00.000Z",
    }));

    const details = toTicketDetails(sampleTicket({ updates }), NOW);

    expect(details.recentUpdates).toHaveLength(5);
    expect(details.recentUpdates[0]).toEqual({
      by: "equipe de TI",
      at: "20/10, 10:00",
      message: "atualização 3",
    });
  });
});
