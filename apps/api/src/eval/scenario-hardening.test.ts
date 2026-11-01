import { describe, expect, it } from "vitest";
import type { LlmConfig } from "../config.ts";
import { MOCK_LIMITS, runEvaluation } from "./run-evaluation.ts";
import { EVAL_SCENARIOS } from "./scenarios.ts";
import { scriptedModel, type ScriptedStep } from "./scripted-model.ts";

/**
 * Cenários que só o modelo real roda (requiresRealModel): aqui o "modelo" é um roteiro escrito pelo
 * teste, para provar que um agent errado reprova e um certo passa. Nada sai para a rede.
 */
const REAL_MODE_WITHOUT_NETWORK: LlmConfig = {
  LLM_MODE: "gemini",
  GEMINI_API_KEY: "chave-de-teste-nunca-usada",
  LLM_MODEL: "modelo-de-teste",
};

async function resultOf(
  id: string,
  intent: "out_of_scope" | "unclear" | "new_ticket" | "ticket_status",
  confidence: number,
  steps: ScriptedStep[],
) {
  const scenario = EVAL_SCENARIOS.find((item) => item.id === id);
  if (!scenario) throw new Error(`Cenário ${id} não existe`);
  const report = await runEvaluation({
    scenarios: [scenario],
    llm: REAL_MODE_WITHOUT_NETWORK,
    model: scriptedModel({ classification: { intent, confidence }, steps }),
    limits: MOCK_LIMITS,
    nowMs: () => 0,
    sleep: () => Promise.resolve(),
  });
  const result = report.scenarios[0];
  if (!result) throw new Error("relatório vazio");
  return result;
}

const rules = (result: Awaited<ReturnType<typeof resultOf>>) =>
  result.failedChecks.map((check) => check.rule);

describe("RN07: vencido-oferece-analista exige a oferta de analista, não só a palavra", () => {
  const consult: ScriptedStep = { call: { name: "get_ticket", input: { number: "INC-20311" } } };

  it("reprova o agent que só repete o status 'aguardando analista' do chamado", async () => {
    const result = await resultOf("vencido-oferece-analista", "ticket_status", 0.9, [
      consult,
      { text: "O chamado INC-20311 está aguardando analista e passou do prazo." },
    ]);

    expect(result.status).toBe("failed");
    expect(rules(result)).toEqual(["reply.mustMatch"]);
  });

  it("aprova o agent que oferece falar com um analista", async () => {
    const result = await resultOf("vencido-oferece-analista", "ticket_status", 0.9, [
      consult,
      { text: "O prazo venceu. Quer falar com um analista sobre ele?" },
    ]);

    expect(result.failedChecks).toEqual([]);
    expect(result.status).toBe("passed");
  });
});

describe("RN10: fora-de-escopo-ferias exige o redirecionamento ao RH", () => {
  it("reprova o agent que responde com um número de dias de férias inventado", async () => {
    const result = await resultOf("fora-de-escopo-ferias", "out_of_scope", 0.9, [
      { text: "Você ainda tem 20 dias de férias." },
    ]);

    expect(result.status).toBe("failed");
    expect(rules(result)).toEqual(["reply.mustMatch", "reply.mustNotMatch"]);
  });

  it("aprova o agent que indica o RH", async () => {
    const result = await resultOf("fora-de-escopo-ferias", "out_of_scope", 0.9, [
      { call: { name: "search_knowledge_base", input: { query: "férias" } } },
      { text: "Férias são com o RH: portal do colaborador ou ramal 4100." },
    ]);

    expect(result.failedChecks).toEqual([]);
    expect(result.status).toBe("passed");
  });
});

describe("R39: pedido-vago-pergunta exige esclarecimento de verdade", () => {
  it("reprova o agent que consulta a central de ajuda e termina com um '?' de cortesia", async () => {
    const result = await resultOf("pedido-vago-pergunta", "unclear", 0.3, [
      { call: { name: "search_knowledge_base", input: { query: "computador esquisito" } } },
      { text: "Não achei nada sobre isso. Posso ajudar em mais alguma coisa?" },
    ]);

    expect(result.status).toBe("failed");
    expect(rules(result)).toEqual(["asksQuestion"]);
  });

  it("aprova o agent que pergunta com opções", async () => {
    const result = await resultOf("pedido-vago-pergunta", "unclear", 0.3, [
      {
        call: {
          name: "ask_with_options",
          input: { question: "O que acontece?", options: ["Lento", "Não liga"] },
        },
      },
      { text: "Para eu entender melhor:" },
    ]);

    expect(result.failedChecks).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("aprova o agent que pergunta em texto, sem consultar nada", async () => {
    const result = await resultOf("pedido-vago-pergunta", "unclear", 0.3, [
      { text: "O que exatamente está esquisito no seu computador?" },
    ]);

    expect(result.status).toBe("passed");
  });
});

describe("RN05: duplicidade-acesso-sharepoint exige o sinal de duplicidade", () => {
  it("reprova o agent que só lista os chamados e cita o INC-20298 no texto", async () => {
    const result = await resultOf("duplicidade-acesso-sharepoint", "new_ticket", 0.9, [
      { call: { name: "list_my_tickets", input: { filter: "open" } } },
      { text: "Você já tem o INC-20298 aberto sobre isso." },
    ]);

    expect(result.status).toBe("failed");
    expect(rules(result)).toEqual(["duplicateOf"]);
  });

  it("aprova o agent cuja proposta de rascunho recebe o sinal de chamado parecido", async () => {
    const result = await resultOf("duplicidade-acesso-sharepoint", "new_ticket", 0.9, [
      {
        call: {
          name: "propose_ticket_draft",
          input: {
            title: "Acesso à pasta Financeiro no SharePoint",
            description: "Perdi o acesso à pasta Financeiro no SharePoint.",
            type: "incident",
            category: "access",
            affected: "just_me",
            urgency: "blocked",
            duplicatesReviewed: false,
          },
        },
      },
      { text: "Você já tem o INC-20298 aberto. Quer complementar?" },
    ]);

    expect(result.failedChecks).toEqual([]);
    expect(result.status).toBe("passed");
  });
});
