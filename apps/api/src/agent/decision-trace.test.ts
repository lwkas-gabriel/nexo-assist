import { decisionViewSchema } from "@nexo/shared/contracts";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { Classification, ClassificationResult } from "./classifier.ts";
import { buildDecisionTrace } from "./decision-trace.ts";

const classification: Classification = {
  intent: "new_ticket",
  understood: "A VPN não conecta e há reunião às 14h.",
  extracted: { category: "network_vpn", urgency: "deadline_today" },
  confidence: 0.9,
  reason: "Relata um problema e pede atendimento.",
};
const classified: ClassificationResult = { ok: true, classification, tokens: 120 };

/** Resposta do agent com as tools que ele chamou, como o AI SDK guarda. */
function responseWith(...tools: { name: string; output?: unknown; error?: true }[]): UIMessage {
  return {
    id: "m-1",
    role: "assistant",
    parts: [
      ...tools.map((tool, index) =>
        tool.error
          ? {
              type: `tool-${tool.name}` as const,
              toolCallId: `c-${index}`,
              state: "output-error" as const,
              input: {},
              errorText: "falhou",
            }
          : {
              type: `tool-${tool.name}` as const,
              toolCallId: `c-${index}`,
              state: "output-available" as const,
              input: {},
              output: tool.output,
            },
      ),
      { type: "text", text: "Resposta." },
    ],
  };
}

describe("registro de decisão (RF05, R09)", () => {
  it("10.4: o passo traz a entrada resumida e os artigos que serviram de fonte", () => {
    const response = responseWith({
      name: "search_knowledge_base",
      output: { articles: [{ title: "VPN: erro 809" }, { title: "VPN no celular" }] },
    });
    const [part] = response.parts;
    if (part?.type === "tool-search_knowledge_base") part.input = { query: "vpn erro 809" };

    const [step] = buildDecisionTrace(classified, response).steps;

    expect(step).toEqual({
      tool: "search_knowledge_base",
      ok: true,
      outcome: "2 artigo(s) encontrado(s)",
      input: "busca: vpn erro 809",
      sources: ["VPN: erro 809", "VPN no celular"],
    });
  });

  it("motivo interno de uma ação que não concluiu aparece em português, nunca o código", () => {
    const trace = buildDecisionTrace(
      classified,
      responseWith(
        { name: "get_ticket", output: { ok: false, reason: "not_found" } },
        { name: "get_ticket", output: { ok: false, reason: "motivo_novo" } },
      ),
    );

    expect(trace.steps.map((step) => step.outcome)).toEqual([
      "não concluiu: chamado não encontrado entre os seus",
      "não concluiu",
    ]);
  });

  it("a origem da confiança diz quem decidiu: classificador, código ou valor neutro", () => {
    const plain = responseWith();

    expect(buildDecisionTrace(classified, plain).confidenceSource).toBe("classifier");
    expect(
      buildDecisionTrace({ ...classified, decidedBy: "quick_answer" }, plain).confidenceSource,
    ).toBe("quick_answer");
    expect(buildDecisionTrace({ ok: false, classification }, plain).confidenceSource).toBe(
      "neutral",
    );
  });

  it("RF05: cumpre o contrato que a tela usa para mostrar o detalhe da decisão", () => {
    const trace = buildDecisionTrace(
      { ok: false, classification },
      responseWith(
        { name: "search_knowledge_base", output: { articles: [] } },
        { name: "get_ticket", error: true },
      ),
    );

    expect(decisionViewSchema.parse(trace)).toEqual(trace);
  });

  it("junta o que o classificador entendeu, o que o agent fez e as regras aplicadas", () => {
    const trace = buildDecisionTrace(
      classified,
      responseWith({
        name: "propose_ticket_draft",
        output: {
          ok: true,
          draft: { ticket: { priorityReason: "RN11: somente você + compromisso hoje → Alta" } },
        },
      }),
    );

    expect(trace).toEqual({
      intent: "abrir chamado",
      understood: "A VPN não conecta e há reunião às 14h.",
      extracted: { category: "network_vpn", urgency: "deadline_today" },
      classifierConfidence: 0.9,
      finalConfidence: 0.9,
      isLowConfidence: false,
      reason: "Relata um problema e pede atendimento.",
      confidenceSource: "classifier",
      steps: [{ tool: "propose_ticket_draft", ok: true, outcome: "concluiu" }],
      rules: ["RN11: somente você + compromisso hoje → Alta"],
      signals: [],
    });
  });

  it("R09: central de ajuda sem artigo reduz a confiança e diz por quê", () => {
    const trace = buildDecisionTrace(
      classified,
      responseWith({ name: "search_knowledge_base", output: { articles: [] } }),
    );

    expect(trace).toMatchObject({
      finalConfidence: 0.7,
      steps: [{ outcome: "0 artigo(s) encontrado(s)" }],
      signals: [{ code: "kb_without_answer", penalty: 0.2 }],
    });
  });

  it("R09: sinais somam, e a confiança final abaixo de 0,5 é baixa (R39)", () => {
    const trace = buildDecisionTrace(
      { ...classified, classification: { ...classification, confidence: 0.6 } },
      responseWith(
        { name: "list_my_tickets", output: { ok: false, reason: "tickets_unavailable" } },
        { name: "propose_ticket_draft", output: { ok: false, reason: "incomplete", missing: [] } },
      ),
    );

    expect(trace).toMatchObject({
      finalConfidence: 0.25,
      isLowConfidence: true,
      signals: [{ code: "tickets_failed" }, { code: "missing_fields" }],
    });
  });

  it("um chamado parecido não reduz; mais de um, sim", () => {
    const one = buildDecisionTrace(
      classified,
      responseWith({
        name: "propose_ticket_draft",
        output: { ok: false, reason: "possible_duplicate", candidates: [{}] },
      }),
    );
    const several = buildDecisionTrace(
      classified,
      responseWith({
        name: "propose_ticket_draft",
        output: { ok: false, reason: "possible_duplicate", candidates: [{}, {}] },
      }),
    );

    expect(one.signals).toEqual([]);
    // Apontar duplicado é o caminho normal: o passo aparece como concluído, não como falha.
    expect(one.steps).toEqual([
      { tool: "propose_ticket_draft", ok: true, outcome: "apontou chamado parecido" },
    ]);
    expect(several.signals).toMatchObject([{ code: "several_duplicates" }]);
  });

  it("ação que falhou aparece no registro e reduz a confiança", () => {
    const trace = buildDecisionTrace(classified, responseWith({ name: "get_ticket", error: true }));

    expect(trace).toMatchObject({
      steps: [{ tool: "get_ticket", ok: false, outcome: "falhou" }],
      signals: [{ code: "action_failed" }],
    });
  });

  it("sem classificador, o registro diz isso e usa a confiança neutra", () => {
    const trace = buildDecisionTrace(
      { ok: false, classification: { ...classification, intent: "unclear", confidence: 0.5 } },
      responseWith(),
    );

    expect(trace).toMatchObject({
      intent: "não ficou claro",
      finalConfidence: 0.5,
      signals: [{ code: "classifier_unavailable", penalty: 0 }],
    });
  });

  it("transferência aparece como regra aplicada (A03)", () => {
    const trace = buildDecisionTrace(
      classified,
      responseWith({
        name: "handoff_to_analyst",
        output: { ok: true, handoff: { supportLevel: "N2", reason: "caso crítico" } },
      }),
    );

    expect(trace.rules).toEqual(["A03: caso crítico → Suporte N2"]);
  });
});
