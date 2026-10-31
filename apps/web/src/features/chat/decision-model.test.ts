import { URGENCY_LABELS } from "@nexo/shared/domain";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { decisionOf, extractedFields, isCodeDecision, stepLabel } from "./decision-model.ts";
import { sampleDecision } from "./decision.fixture.ts";

const withMetadata = (metadata: unknown): UIMessage => ({
  id: "m-1",
  role: "assistant",
  parts: [],
  metadata,
});

describe("registro de decisão na tela (RF05)", () => {
  it("lê o registro dos metadados; ausente ou fora do contrato, não há detalhe a mostrar", () => {
    expect(decisionOf(withMetadata({ author: "agent", decision: sampleDecision }))).toEqual(
      sampleDecision,
    );
    expect(decisionOf(withMetadata({ author: "agent" }))).toBeUndefined();
    expect(decisionOf(withMetadata({ decision: { intent: "x" } }))).toBeUndefined();
    expect(decisionOf(withMetadata(undefined))).toBeUndefined();
  });

  it("os campos extraídos aparecem com os rótulos do card; código desconhecido fica de fora", () => {
    const decision = { ...sampleDecision, extracted: { ...sampleDecision.extracted, x: "y" } };

    expect(extractedFields(decision)).toEqual([
      { label: "Categoria", value: "Rede e VPN" },
      { label: "Urgência", value: URGENCY_LABELS.deadline_today },
      { label: "Chamado", value: "INC-20311" },
    ]);
    expect(extractedFields({ ...sampleDecision, extracted: { category: "x" } })).toEqual([]);
  });

  it("os passos usam o texto dos chips; os botões aparecem pelo nome", () => {
    expect(stepLabel("search_knowledge_base")).toBe("buscou na central de ajuda");
    expect(stepLabel("draft_button")).toBe("botão do card do rascunho");
    expect(isCodeDecision(sampleDecision)).toBe(false);
    expect(
      isCodeDecision({
        ...sampleDecision,
        steps: [{ tool: "ticket_selection", ok: true, outcome: "concluiu" }],
      }),
    ).toBe(true);
  });
});
