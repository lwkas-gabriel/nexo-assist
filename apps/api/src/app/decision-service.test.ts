import { describe, expect, it } from "vitest";
import type { ClassificationResult } from "../agent/classifier.ts";
import type { DecisionStore } from "../db/decision-store.ts";
import { createFakeTicketGateway, createTestAgentServices } from "../test-support.ts";
import { createDecisionService } from "./decision-service.ts";

const clock = { now: () => new Date("2026-10-27T12:00:00Z") };
const vague: ClassificationResult = {
  ok: true,
  tokens: 50,
  classification: {
    intent: "unclear",
    understood: "Algo estranho no computador.",
    extracted: {},
    confidence: 0.3,
    reason: "Mensagem vaga.",
  },
};

describe("limiar de confiança (R39)", () => {
  it("falha ao gravar o registro não derruba o aviso da transferência já feita", async () => {
    const { handoffService, conversationStore, conversationId } = await createTestAgentServices(
      createFakeTicketGateway().ticketGateway,
      clock,
    );
    const brokenStore: DecisionStore = {
      create: () => Promise.reject(new Error("disco cheio")),
      // A mensagem anterior também foi vaga.
      previousClassifierConfidence: () => Promise.resolve(0.3),
      listSince: () => Promise.resolve([]),
      byMessage: () => Promise.resolve(new Map()),
    };
    const decisions = createDecisionService({ decisionStore: brokenStore, handoffService, clock });

    const route = await decisions.routeTurn({
      employeeId: "emp-ana-souza",
      conversationId,
      conversationVersion: 1,
      classification: vague,
      startedAt: clock.now(),
    });

    expect(route).toMatchObject({ kind: "escalated" });
    expect(await conversationStore.findById(conversationId)).toMatchObject({
      mode: "waiting_analyst",
    });
  });

  it("com a conversa já transferida por outra ação, o turno fica em pausa (sem o agent)", async () => {
    const { handoffService, conversationId } = await createTestAgentServices(
      createFakeTicketGateway().ticketGateway,
      clock,
    );
    const store: DecisionStore = {
      create: () => Promise.resolve(),
      previousClassifierConfidence: () => Promise.resolve(0.3),
      listSince: () => Promise.resolve([]),
      byMessage: () => Promise.resolve(new Map()),
    };
    const decisions = createDecisionService({ decisionStore: store, handoffService, clock });
    await handoffService.handoff({
      employeeId: "emp-ana-souza",
      conversationId,
      reason: "employee_request",
      summary: { problem: "x", attempted: "y" },
    });

    const route = await decisions.routeTurn({
      employeeId: "emp-ana-souza",
      conversationId,
      conversationVersion: 1,
      classification: vague,
      startedAt: clock.now(),
    });

    expect(route).toEqual({ kind: "paused" });
  });
});
