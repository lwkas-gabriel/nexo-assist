import { describe, expect, it } from "vitest";
import { handoffResponseDue, supportLevelFor, verifiedHandoffReason } from "./handoff.ts";

function brasilia(dateTime: string): Date {
  return new Date(`${dateTime}-03:00`);
}

describe("supportLevelFor (A03)", () => {
  it("A03: crítico, vencido e falta de segurança do agent vão para o N2", () => {
    expect(supportLevelFor("critical")).toBe("N2");
    expect(supportLevelFor("overdue", { priority: "medium", isOverdue: true })).toBe("N2");
    expect(supportLevelFor("low_confidence")).toBe("N2");
  });

  it("A03: pedido do funcionário vai para o N1, a não ser que o chamado seja crítico", () => {
    expect(supportLevelFor("employee_request")).toBe("N1");
    expect(supportLevelFor("employee_request", { priority: "low", isOverdue: false })).toBe("N1");
    expect(supportLevelFor("employee_request", { priority: "critical", isOverdue: false })).toBe(
      "N2",
    );
  });

  it("A03: chamado vencido vai para o N2 mesmo que o motivo registrado seja o pedido", () => {
    expect(supportLevelFor("employee_request", { priority: "medium", isOverdue: true })).toBe("N2");
  });
});

describe("handoffResponseDue (A02)", () => {
  it("A02: chamado crítico tem contato em 1 hora", () => {
    expect(
      handoffResponseDue("employee_request", "critical", brasilia("2026-10-27T09:00")),
    ).toEqual(brasilia("2026-10-27T10:00"));
  });

  it("A02: caso crítico sem chamado ligado também tem contato em 1 hora", () => {
    expect(handoffResponseDue("critical", undefined, brasilia("2026-10-30T17:30"))).toEqual(
      brasilia("2026-10-30T18:30"),
    );
  });

  it("A02: os demais, e sem chamado ligado, em 4 horas úteis (prazo de Alta)", () => {
    const at = brasilia("2026-10-27T09:00");
    expect(handoffResponseDue("employee_request", undefined, at)).toEqual(
      brasilia("2026-10-27T13:00"),
    );
    expect(handoffResponseDue("overdue", "medium", at)).toEqual(brasilia("2026-10-27T13:00"));
    expect(handoffResponseDue("employee_request", "low", at)).toEqual(brasilia("2026-10-27T13:00"));
  });
});

describe("verifiedHandoffReason", () => {
  it("'prazo vencido' só fica registrado se o chamado ligado está mesmo vencido", () => {
    expect(verifiedHandoffReason("overdue", { priority: "medium", isOverdue: true })).toBe(
      "overdue",
    );
    expect(verifiedHandoffReason("overdue", { priority: "medium", isOverdue: false })).toBe(
      "employee_request",
    );
    expect(verifiedHandoffReason("overdue")).toBe("employee_request");
  });

  it("os outros motivos ficam como o agent registrou", () => {
    expect(verifiedHandoffReason("critical")).toBe("critical");
    expect(verifiedHandoffReason("low_confidence")).toBe("low_confidence");
  });
});
