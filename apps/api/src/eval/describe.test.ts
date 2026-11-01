import { describe, expect, it } from "vitest";
import { describeExpectation, describeObservation, joinTurns } from "./describe.ts";
import type { TurnObservation } from "./observation.ts";

function observation(overrides: Partial<TurnObservation> = {}): TurnObservation {
  return {
    replyText: "",
    agentText: "",
    toolCalls: [],
    decision: undefined,
    newDrafts: [],
    createdTickets: [],
    contentWrites: [],
    accessedOwners: [],
    handoff: undefined,
    ...overrides,
  };
}

describe("frases do relatório", () => {
  it("descreve a ação esperada com tools, intenção, rascunho, chamados e transferência", () => {
    const text = describeExpectation({
      tools: { mustCall: ["propose_ticket_draft"], mustNotCall: ["confirm_draft"] },
      intent: "new_ticket",
      draft: { kind: "create", type: "incident", priority: "high" },
      ticketsCreated: 0,
      handoff: "none",
    });

    expect(text).toBe(
      'chama propose_ticket_draft; não chama confirm_draft; entende "abrir chamado"; rascunho novo (create, incident, high); 0 chamado(s) criado(s); sem transferência',
    );
  });

  it("descreve a transferência esperada e a feita pelo código", () => {
    expect(describeExpectation({ handoff: { reason: "low_confidence", byCode: true } })).toBe(
      "transfere (low_confidence, pelo código)",
    );
    expect(describeExpectation({ handoff: { supportLevel: "N2" } })).toBe("transfere (N2)");
  });

  it("descreve consulta de chamado com o prazo esperado", () => {
    const text = describeExpectation({ ticketLookup: { numbers: ["INC-20311"], isOverdue: true } });

    expect(text).toBe("consulta INC-20311 vencido");
  });

  it("descreve a ação escolhida: tools, o que entendeu, rascunho, chamado e transferência", () => {
    const text = describeObservation(
      observation({
        toolCalls: [
          { name: "propose_ticket_draft", origin: "agent", input: undefined, output: undefined },
          { name: "handoff_to_analyst", origin: "code", input: undefined, output: undefined },
        ],
        decision: {
          intentLabel: "abrir chamado",
          classifierConfidence: 0.9,
          isClassifierAvailable: true,
        },
        newDrafts: [
          {
            number: 2,
            kind: "create",
            status: "pending",
            ticketNumber: null,
            type: "incident",
            priority: "high",
          },
        ],
        createdTickets: [
          { number: "INC-20505", ownerId: "emp-ana-souza", type: "incident", priority: "high" },
        ],
        handoff: { reason: "critical", supportLevel: "N2", byCode: true },
      }),
    );

    expect(text).toBe(
      'tools: propose_ticket_draft, handoff_to_analyst (código); entendeu "abrir chamado" (0.9); rascunho D-2 (create, incident, high); criou INC-20505 (incident, high); transferiu N2 (critical, pelo código)',
    );
  });

  it("sem tool nenhuma, diz 'nenhuma'", () => {
    expect(describeObservation(observation())).toBe("tools: nenhuma");
  });

  it("junta os turnos só quando há mais de um", () => {
    expect(joinTurns(["a"])).toBe("a");
    expect(joinTurns(["a", "b"])).toBe("T1: a | T2: b");
  });
});
