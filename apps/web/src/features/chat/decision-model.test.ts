import { URGENCY_LABELS } from "@nexo/shared/domain";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  decisionOf,
  describeConfidenceOrigin,
  extractedFields,
  stepLabel,
} from "./decision-model.ts";
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
  });

  it("a frase da confiança diz quem decidiu, sem inventar nota do classificador", () => {
    const at = (confidenceSource: typeof sampleDecision.confidenceSource, final = 1) =>
      describeConfidenceOrigin({
        ...sampleDecision,
        confidenceSource,
        classifierConfidence: confidenceSource === "neutral" ? 0.5 : 1,
        finalConfidence: final,
      });

    expect(describeConfidenceOrigin(sampleDecision)).toBe(
      "O classificador deu 90%; os sinais abaixo reduziram para 75%.",
    );
    expect(at("button")).toBe("Ação por um botão: decidida pelo código, sem o modelo.");
    expect(at("quick_answer")).toBe(
      "Resposta rápida pelo botão: o código conferiu a opção, sem o classificador (100%).",
    );
    expect(at("neutral", 0.5)).toBe("O classificador não respondeu: valor neutro de 50%.");
  });
});
