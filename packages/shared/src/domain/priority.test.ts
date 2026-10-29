import { describe, expect, it } from "vitest";
import { URGENCY_LEVELS, classifyPriority } from "./priority.ts";
import { AFFECTED_SCOPES } from "./ticket.ts";

describe("classifyPriority (RN11)", () => {
  it("RN11: algo parado para a equipe ou a empresa é Crítica", () => {
    expect(classifyPriority("my_team", "blocked").priority).toBe("critical");
    expect(classifyPriority("whole_company", "blocked").priority).toBe("critical");
  });

  it("RN11: impede uma pessoa de trabalhar é Alta", () => {
    expect(classifyPriority("just_me", "blocked").priority).toBe("high");
  });

  it("RN11: compromisso no mesmo dia é Alta (cenário da tela 2: VPN e reunião às 14h)", () => {
    expect(classifyPriority("just_me", "deadline_today")).toEqual({
      priority: "high",
      reason: "RN11: somente você + compromisso hoje → Alta",
    });
  });

  it("RN11: atrapalha, mas há alternativa, é Média", () => {
    expect(classifyPriority("just_me", "has_workaround").priority).toBe("medium");
  });

  it("RN11: pedido sem urgência é Baixa", () => {
    expect(classifyPriority("just_me", "no_urgency").priority).toBe("low");
  });

  it("A06: equipe com alternativa sobe um nível (Alta)", () => {
    expect(classifyPriority("my_team", "has_workaround").priority).toBe("high");
  });

  it("A06: pedido da equipe sem urgência é Média", () => {
    expect(classifyPriority("my_team", "no_urgency").priority).toBe("medium");
  });

  it("mais gente afetada nunca baixa a prioridade", () => {
    const rank = { low: 0, medium: 1, high: 2, critical: 3 };
    for (const urgency of URGENCY_LEVELS) {
      const ranks = AFFECTED_SCOPES.map(
        (affected) => rank[classifyPriority(affected, urgency).priority],
      );
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});
