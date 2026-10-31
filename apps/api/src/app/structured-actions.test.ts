import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { toTicketDetails } from "../agent/ticket-view.ts";
import { sampleTicket } from "../test-support.ts";
import { describeSelectedTicket, quickAnswerClassification } from "./structured-actions.ts";

const askedImpact: UIMessage = {
  id: "agent-1",
  role: "assistant",
  parts: [
    {
      type: "tool-ask_with_options",
      toolCallId: "c-1",
      state: "output-available",
      input: {},
      output: {
        ok: true,
        question: "Quem está sendo afetado?",
        options: ["Só eu", "Minha equipe"],
      },
    },
  ],
};

describe("resposta rápida pelo botão (R38)", () => {
  it("opção da pergunta mais recente: confiança 100%, com a intenção do turno que perguntou", () => {
    const result = quickAnswerClassification(askedImpact, "abrir chamado", "Minha equipe");

    expect(result?.classification).toMatchObject({
      intent: "new_ticket",
      confidence: 1,
      understood: 'Respondeu "Minha equipe" à pergunta "Quem está sendo afetado?".',
    });
  });

  it("texto que não é uma das opções segue para o classificador", () => {
    expect(quickAnswerClassification(askedImpact, "abrir chamado", "Ninguém")).toBeUndefined();
  });

  it("sem pergunta na última mensagem, ou sem registro do turno, segue para o classificador", () => {
    const plain: UIMessage = { id: "a", role: "assistant", parts: [{ type: "text", text: "Oi" }] };

    expect(quickAnswerClassification(plain, "abrir chamado", "Só eu")).toBeUndefined();
    expect(quickAnswerClassification(askedImpact, undefined, "Só eu")).toBeUndefined();
    expect(quickAnswerClassification(undefined, "abrir chamado", "Só eu")).toBeUndefined();
  });
});

describe("resposta à seleção de um chamado (11.5)", () => {
  const now = new Date("2026-10-27T18:00:00Z");

  it("RN12: vencido diz há quanto tempo a TI não responde e oferece um analista", () => {
    const text = describeSelectedTicket(toTicketDetails(sampleTicket(), now));

    expect(text).toMatch(/^INC-20311 · Notebook lento após atualização do Windows: /);
    expect(text).toMatch(/A última resposta da equipe de TI foi há .+\./);
    expect(text).toMatch(/venceu em .+ Quer que eu chame um analista\?$/);
  });

  it("dentro do prazo, diz até quando vem a próxima resposta", () => {
    const recent = sampleTicket({ lastStaffUpdateAt: "2026-10-27T17:00:00.000Z" });

    expect(describeSelectedTicket(toTicketDetails(recent, now))).toMatch(
      /Próxima resposta prevista até .+ \(.+\)\.$/,
    );
  });

  it("RN06: resolvido há poucos dias pode ser reaberto", () => {
    const resolved = sampleTicket({ status: "resolved", resolvedAt: "2026-10-25T12:00:00.000Z" });

    expect(describeSelectedTicket(toTicketDetails(resolved, now))).toMatch(
      /posso reabrir este chamado\.$/,
    );
  });
});
