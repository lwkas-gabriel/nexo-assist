import { describe, expect, it } from "vitest";
import { handoffResponseDue, supportLevelFor } from "./handoff.ts";

function brasilia(dateTime: string): Date {
  return new Date(`${dateTime}-03:00`);
}

describe("supportLevelFor (A03)", () => {
  it("A03: crítico, vencido e falta de segurança do agent vão para o N2", () => {
    expect(supportLevelFor("critical")).toBe("N2");
    expect(supportLevelFor("overdue", "medium")).toBe("N2");
    expect(supportLevelFor("low_confidence")).toBe("N2");
  });

  it("A03: pedido do funcionário vai para o N1, a não ser que o chamado seja crítico", () => {
    expect(supportLevelFor("employee_request")).toBe("N1");
    expect(supportLevelFor("employee_request", "low")).toBe("N1");
    expect(supportLevelFor("employee_request", "critical")).toBe("N2");
  });
});

describe("handoffResponseDue (A02)", () => {
  it("A02: usa o prazo da prioridade do chamado ligado", () => {
    expect(handoffResponseDue("critical", brasilia("2026-10-27T09:00"))).toEqual(
      brasilia("2026-10-27T10:00"),
    );
  });

  it("A02: sem chamado ligado, vale o prazo de prioridade Alta (4 horas úteis)", () => {
    expect(handoffResponseDue(undefined, brasilia("2026-10-27T09:00"))).toEqual(
      brasilia("2026-10-27T13:00"),
    );
  });
});
