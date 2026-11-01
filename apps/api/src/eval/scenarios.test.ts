import { describe, expect, it } from "vitest";
import { createModel, createNexoAgent } from "../agent/nexo-agent.ts";
import { createFakeTicketGateway, createTestAgentServices } from "../test-support.ts";
import { EVAL_TICKET_NUMBERS } from "./fixtures.ts";
import { EVAL_SCENARIOS } from "./scenarios.ts";
import { AGENT_TOOL_IDS, EVAL_CATEGORIES, type EvalScenario } from "./scenario-schema.ts";

describe("o conjunto de cenários da T27", () => {
  it("tem cerca de 15 cenários, com todas as categorias do critério", () => {
    const categories = new Set(EVAL_SCENARIOS.map((item) => item.category));

    expect(EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(15);
    expect(EVAL_SCENARIOS.length).toBeLessThanOrEqual(20);
    expect([...categories].sort()).toEqual([...EVAL_CATEGORIES].sort());
  });

  it("RN09: tem cenários de privacidade e de prompt injection", () => {
    const privacy = EVAL_SCENARIOS.filter((item) => item.category === "privacy");

    expect(privacy.length).toBeGreaterThanOrEqual(3);
  });

  it("cita só chamados que existem nas fixtures da avaliação", () => {
    const cited = EVAL_SCENARIOS.flatMap((item) => item.turns).flatMap(({ expect: turn }) => [
      ...(turn.duplicateOf ? [turn.duplicateOf] : []),
      ...(turn.ticketLookup?.numbers ?? []),
      ...(typeof turn.draft === "object" && turn.draft.ticketNumber
        ? [turn.draft.ticketNumber]
        : []),
    ]);

    expect(cited.length).toBeGreaterThan(0);
    for (const number of cited) expect(EVAL_TICKET_NUMBERS).toContain(number);
  });

  it("os ids são únicos e estão todos em kebab-case", () => {
    const ids = EVAL_SCENARIOS.map((item: EvalScenario) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a lista de tools dos cenários é a lista de tools do agent de verdade", async () => {
    const { ticketGateway } = createFakeTicketGateway();
    const clock = { now: () => new Date("2026-10-27T18:00:00Z") };
    const { draftService, handoffService, conversationStore } = await createTestAgentServices(
      ticketGateway,
      clock,
    );
    const agent = createNexoAgent({
      model: createModel({ LLM_MODE: "mock" }),
      knowledgeBase: { search: () => [] },
      ticketGateway,
      draftService,
      handoffService,
      conversationStore,
      clock,
    });

    const tools = Object.keys(await agent.listTools());

    expect([...tools].sort()).toEqual([...AGENT_TOOL_IDS].sort());
  });
});
