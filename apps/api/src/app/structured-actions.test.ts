import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { INTENTS, INTENT_LABELS, intentFromLabel } from "../agent/classifier.ts";
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

/** O turno que fez a pergunta, como o registro de decisão o guarda. */
const askedWhileOpeningTicket = { intent: "abrir chamado", classifierConfidence: 0.9 };

describe("resposta rápida pelo botão (R38)", () => {
  it("opção da pergunta mais recente: confiança 100%, com a intenção do turno que perguntou", () => {
    const result = quickAnswerClassification(askedImpact, askedWhileOpeningTicket, "Minha equipe");

    expect(result?.classification).toMatchObject({
      intent: "new_ticket",
      confidence: 1,
      understood: 'Respondeu "Minha equipe" à pergunta "Quem está sendo afetado?".',
    });
  });

  it("texto que não é uma das opções segue para o classificador", () => {
    expect(
      quickAnswerClassification(askedImpact, askedWhileOpeningTicket, "Ninguém"),
    ).toBeUndefined();
  });

  it("sem pergunta na última mensagem, ou sem registro do turno, segue para o classificador", () => {
    const plain: UIMessage = { id: "a", role: "assistant", parts: [{ type: "text", text: "Oi" }] };

    expect(quickAnswerClassification(plain, askedWhileOpeningTicket, "Só eu")).toBeUndefined();
    expect(quickAnswerClassification(askedImpact, undefined, "Só eu")).toBeUndefined();
    expect(quickAnswerClassification(undefined, askedWhileOpeningTicket, "Só eu")).toBeUndefined();
  });

  it("R39: pergunta feita sem ter entendido não vira confiança 100% (segue para o classificador)", () => {
    const unclear = { intent: "não ficou claro", classifierConfidence: 0.9 };
    const lowConfidence = { intent: "abrir chamado", classifierConfidence: 0.3 };

    expect(quickAnswerClassification(askedImpact, unclear, "Só eu")).toBeUndefined();
    expect(quickAnswerClassification(askedImpact, lowConfidence, "Só eu")).toBeUndefined();
  });

  it("toda intenção volta do rótulo que o registro guarda", () => {
    for (const intent of INTENTS) expect(intentFromLabel(INTENT_LABELS[intent])).toBe(intent);
    expect(intentFromLabel("rótulo que não existe")).toBeUndefined();
  });
});

describe("resposta à seleção de um chamado (11.5)", () => {
  const now = new Date("2026-10-27T18:00:00Z");
  const describe_ = (ticket = sampleTicket(), sessionAtLimit = false) =>
    describeSelectedTicket(toTicketDetails(ticket, now), { sessionAtLimit });

  it("RN12: vencido diz há quanto tempo a TI não responde e oferece um analista", () => {
    const text = describe_();

    expect(text).toMatch(/^INC-20311 · Notebook lento após atualização do Windows: /);
    expect(text).toMatch(/A última resposta da equipe de TI foi há .+\./);
    expect(text).toMatch(/venceu em .+ Quer que eu chame um analista\?$/);
  });

  it("RN14: no limite da sessão, aponta o botão em vez de pedir um 'sim' que seria recusado", () => {
    expect(describe_(sampleTicket(), true)).toMatch(
      /Para falar com um analista, use o botão abaixo\.$/,
    );
  });

  it("dentro do prazo, diz até quando vem a próxima resposta", () => {
    const recent = sampleTicket({ lastStaffUpdateAt: "2026-10-27T17:00:00.000Z" });

    expect(describe_(recent)).toMatch(/Próxima resposta prevista até .+ \(.+\)\.$/);
  });

  it("RN06: resolvido há poucos dias pode ser reaberto", () => {
    const resolved = sampleTicket({ status: "resolved", resolvedAt: "2026-10-25T12:00:00.000Z" });

    expect(describe_(resolved)).toMatch(/posso reabrir este chamado\.$/);
  });
});
