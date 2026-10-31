import { describe, expect, it } from "vitest";
import { describeContactDue, listTime, stateTag } from "./console-model.ts";

const now = new Date("2026-10-31T13:40:00Z"); // 10:40 em Brasília

describe("etiquetas e horas do console (tela 4)", () => {
  it("R36: o prazo de contato é contado a partir de agora", () => {
    expect(describeContactDue("2026-10-31T14:05:00Z", now)).toBe("contato em 25 min");
    expect(describeContactDue("2026-10-31T16:40:00Z", now)).toBe("contato em 3 h");
    expect(describeContactDue("2026-10-31T13:00:00Z", now)).toBe("contato vencido");
  });

  it("10.2: transferida em perigo, com o chamado ou o prazo; pedido de ajuda em aviso", () => {
    const waiting = {
      kind: "waiting" as const,
      reason: "x",
      responseDueAt: "2026-10-31T14:05:00Z",
    };

    expect(stateTag({ ...waiting, ticketNumber: "INC-20311", confidence: null }, now)).toEqual({
      label: "Transferida · INC-20311",
      tone: "danger",
    });
    expect(stateTag({ ...waiting, ticketNumber: null, confidence: null }, now).label).toBe(
      "Transferida · contato em 25 min",
    );
    expect(stateTag({ ...waiting, ticketNumber: null, confidence: 0.41 }, now)).toEqual({
      label: "Agent pediu ajuda · confiança 41%",
      tone: "warning",
    });
  });

  it("com analista diz quem; com o agent, Agent atendendo", () => {
    expect(stateTag({ kind: "analyst", byMe: true, analyst: null }, now).label).toBe(
      "Você está atendendo",
    );
    expect(
      stateTag(
        {
          kind: "analyst",
          byMe: false,
          analyst: { name: "Juliana Costa", department: "Suporte N1" },
        },
        now,
      ).label,
    ).toBe("Com Juliana Costa");
    expect(stateTag({ kind: "agent" }, now).label).toBe("Agent atendendo");
  });

  it("hora da lista como no protótipo: agora, hora de hoje, ontem ou a data", () => {
    expect(listTime("2026-10-31T13:39:30Z", now)).toBe("agora");
    expect(listTime("2026-10-31T13:05:00Z", now)).toBe("10:05");
    expect(listTime("2026-10-30T13:05:00Z", now)).toBe("ontem");
    expect(listTime("2026-10-28T13:05:00Z", now)).toBe("28/10");
  });
});
