import { describe, expect, it } from "vitest";
import { computeDeadline, getSlaStatus, type SlaTrackedTicket } from "./sla.ts";

/** Horário de Brasília (UTC-3) escrito por extenso, para os casos ficarem legíveis. */
function brasilia(dateTime: string): Date {
  return new Date(`${dateTime}-03:00`);
}

describe("computeDeadline (RN12)", () => {
  it("RN12: crítica tem 1 hora corrida, mesmo de madrugada no fim de semana (plantão 24 h)", () => {
    expect(computeDeadline("critical", brasilia("2026-10-24T03:00"))).toEqual(
      brasilia("2026-10-24T04:00"),
    );
  });

  it("RN12: alta tem 4 horas úteis", () => {
    expect(computeDeadline("high", brasilia("2026-10-20T09:43"))).toEqual(
      brasilia("2026-10-20T13:43"),
    );
  });

  it("RN12 + A24: média tem 3 dias úteis (segunda 10h → quinta 10h)", () => {
    expect(computeDeadline("medium", brasilia("2026-10-19T10:00"))).toEqual(
      brasilia("2026-10-22T10:00"),
    );
  });

  it("RN12 + A24: baixa tem 5 dias úteis, atravessando o fim de semana", () => {
    expect(computeDeadline("low", brasilia("2026-10-21T09:00"))).toEqual(
      brasilia("2026-10-28T09:00"),
    );
  });
});

describe("getSlaStatus", () => {
  // Cenário do protótipo (tela 3): INC-20311, média, última atualização da TI há 5 dias.
  const slowLaptop: SlaTrackedTicket = {
    status: "waiting_analyst",
    priority: "medium",
    createdAt: brasilia("2026-10-16T14:20"),
    lastStaffUpdateAt: brasilia("2026-10-22T14:20"),
  };

  it("RN12: está em dia antes do prazo", () => {
    const status = getSlaStatus(slowLaptop, brasilia("2026-10-27T10:00"));

    expect(status).toEqual({
      isTracked: true,
      deadline: brasilia("2026-10-27T14:20"),
      isOverdue: false,
    });
  });

  it("RN12: passado o prazo sem atualização da TI, o chamado está vencido", () => {
    const status = getSlaStatus(slowLaptop, brasilia("2026-10-27T15:00"));

    expect(status).toMatchObject({ isTracked: true, isOverdue: true });
  });

  it("RN12: sem atualização da TI, o prazo conta da abertura (primeira resposta)", () => {
    const neverAnswered: SlaTrackedTicket = {
      status: "waiting_analyst",
      priority: "medium",
      createdAt: brasilia("2026-10-16T14:20"),
    };

    const status = getSlaStatus(neverAnswered, brasilia("2026-10-27T10:00"));

    expect(status).toMatchObject({ deadline: brasilia("2026-10-21T14:20"), isOverdue: true });
  });

  it("RN12: chamado fechado não tem prazo nem fica vencido", () => {
    const status = getSlaStatus(
      { ...slowLaptop, status: "resolved" },
      brasilia("2027-01-01T10:00"),
    );

    expect(status).toEqual({ isTracked: false });
  });
});
