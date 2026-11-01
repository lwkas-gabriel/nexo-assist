import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { LlmConfig } from "../config.ts";
import { createMockModel } from "../agent/mock-model.ts";
import { mockModelWithClassifier } from "../test-support.ts";
import { exitCodeOf, formatReport } from "./report.ts";
import {
  GEMINI_LIMITS,
  MOCK_LIMITS,
  MOCK_MODE_WARNING,
  runEvaluation,
  type EvalLimits,
  type EvaluationReport,
} from "./run-evaluation.ts";
import { EVAL_SCENARIOS } from "./scenarios.ts";
import type { EvalScenario } from "./scenario-schema.ts";

const MOCK: LlmConfig = { LLM_MODE: "mock" };
/**
 * Config do modo gemini só para os testes escolherem esse modo: o modelo é sempre trocado por um
 * falso (`model`), então a chave nunca é usada e nada sai para a rede.
 */
const GEMINI_WITHOUT_NETWORK: LlmConfig = {
  LLM_MODE: "gemini",
  GEMINI_API_KEY: "chave-de-teste-nunca-usada",
  LLM_MODEL: "modelo-de-teste",
};
const NO_WAIT = { nowMs: () => 0, sleep: () => Promise.resolve() };
const UNLIMITED: EvalLimits = { ...MOCK_LIMITS };

function scenarioById(id: string): EvalScenario {
  const found = EVAL_SCENARIOS.find((scenario) => scenario.id === id);
  if (!found) throw new Error(`Cenário ${id} não existe`);
  return found;
}

function statusOf(report: EvaluationReport, id: string) {
  const found = report.scenarios.find((scenario) => scenario.id === id);
  if (!found) throw new Error(`Cenário ${id} fora do relatório`);
  return found;
}

/** Modelo que sempre falha como o provedor falharia (cota esgotada, chave inválida...). */
function failingModel(statusCode: number) {
  const fail = () =>
    Promise.reject(
      new APICallError({
        message: "falha do provedor",
        url: "https://provedor.invalid/modelo",
        requestBodyValues: {},
        statusCode,
      }),
    );
  return new MockLanguageModelV4({ doGenerate: fail, doStream: fail });
}

describe("avaliação roteirizada no modo mock", () => {
  it(
    "roda o conjunto inteiro no agent real: o que o mock exercita passa e o resto é ignorado com aviso",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: EVAL_SCENARIOS,
        llm: MOCK,
        limits: MOCK_LIMITS,
        ...NO_WAIT,
      });

      const runnable = EVAL_SCENARIOS.filter((scenario) => !scenario.requiresRealModel);
      const needsRealModel = EVAL_SCENARIOS.filter((scenario) => scenario.requiresRealModel);
      expect(runnable.length).toBeGreaterThan(0);
      expect(needsRealModel.length).toBeGreaterThan(0);
      for (const scenario of runnable) {
        const result = statusOf(report, scenario.id);
        expect(result.failedChecks, `${scenario.id}: ${result.reason ?? ""}`).toEqual([]);
        expect(result.status, scenario.id).toBe("passed");
      }
      for (const scenario of needsRealModel) {
        const result = statusOf(report, scenario.id);
        expect(result.status).toBe("not_evaluated");
        expect(result.reason).toContain("exige modelo real");
      }
      expect(report.warnings).toEqual([MOCK_MODE_WARNING]);
      expect(report.totals.failed).toBe(0);
      expect(exitCodeOf(report)).toBe(0);
      expect(formatReport(report)).toContain("NÃO mede a qualidade");
    },
  );

  it(
    "extrai do agent real a ação escolhida: tool, rascunho, chamado criado e transferência",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: [
          scenarioById("confirma-rascunho-e-cria"),
          scenarioById("pede-analista"),
          scenarioById("pedido-vago-duas-vezes-transfere"),
        ],
        llm: MOCK,
        limits: MOCK_LIMITS,
        ...NO_WAIT,
      });

      expect(statusOf(report, "confirma-rascunho-e-cria").chosen).toContain(
        "rascunho D-1 (create, incident",
      );
      expect(statusOf(report, "confirma-rascunho-e-cria").chosen).toMatch(
        /criou INC-\d+ \(incident/,
      );
      expect(statusOf(report, "pede-analista").chosen).toContain(
        "transferiu N1 (employee_request)",
      );
      expect(statusOf(report, "pedido-vago-duas-vezes-transfere").chosen).toContain(
        "transferiu N2 (low_confidence, pelo código)",
      );
      expect(statusOf(report, "pedido-vago-duas-vezes-transfere").chosen).toContain(
        "handoff_to_analyst (código)",
      );
    },
  );

  it(
    "cada turno enxerga só o que ele mesmo produziu (rascunho, chamado e transferência não vazam para o seguinte)",
    { timeout: 60_000 },
    async () => {
      const scenario: EvalScenario = {
        id: "turnos-independentes",
        category: "draft_confirmation",
        description: "Cinco turnos em que cada um espera só a sua parte",
        employeeId: "emp-henrique-alves",
        requiresRealModel: false,
        turns: [
          {
            message: "Preciso abrir um chamado: o Outlook não abre e só eu estou parado.",
            expect: { draft: { kind: "create" }, ticketsCreated: 0, handoff: "none" },
          },
          {
            message: "Pode criar, confirmo.",
            expect: { ticketsCreated: 1, draft: "none", handoff: "none" },
          },
          {
            message: "Como está o meu chamado?",
            expect: {
              ticketsCreated: 0,
              draft: "none",
              handoff: "none",
              tools: { mustCall: ["list_my_tickets"], mustNotCall: ["confirm_draft"] },
            },
          },
          {
            message: "Quero falar com um analista.",
            expect: {
              handoff: { reason: "employee_request" },
              ticketsCreated: 0,
              draft: "none",
              tools: { mustCall: ["handoff_to_analyst"], mustNotCall: ["list_my_tickets"] },
            },
          },
          {
            message: "Obrigado pela ajuda.",
            expect: { handoff: "none", ticketsCreated: 0, draft: "none", tools: { none: true } },
          },
        ],
      };

      const report = await runEvaluation({
        scenarios: [scenario],
        llm: MOCK,
        limits: MOCK_LIMITS,
        ...NO_WAIT,
      });

      const result = statusOf(report, "turnos-independentes");
      expect(result.failedChecks).toEqual([]);
      expect(result.status).toBe("passed");
    },
  );

  it(
    "detecta quando a ação escolhida é diferente da esperada (o cenário falha, com o porquê)",
    { timeout: 60_000 },
    async () => {
      const original = scenarioById("duvida-vpn-erro-809");
      const [firstTurn] = original.turns;
      if (!firstTurn) throw new Error("cenário sem turnos");
      const wrongExpectation: EvalScenario = {
        ...original,
        turns: [
          {
            ...firstTurn,
            expect: {
              tools: { mustCall: ["handoff_to_analyst"] },
              handoff: { supportLevel: "N2" },
            },
          },
        ],
      };

      const report = await runEvaluation({
        scenarios: [wrongExpectation],
        llm: MOCK,
        limits: MOCK_LIMITS,
        ...NO_WAIT,
      });

      const result = statusOf(report, "duvida-vpn-erro-809");
      expect(result.status).toBe("failed");
      expect(result.failedChecks.map((check) => check.rule)).toEqual(["tools.mustCall", "handoff"]);
      expect(report.totals.failed).toBe(1);
      expect(exitCodeOf(report)).toBe(1);
    },
  );
});

/** Modelo que responde às perguntas do funcionário com este texto, sem tools; o classificador segue o roteiro. */
function modelAnsweringWith(text: string) {
  const scripted = createMockModel();
  const chunks: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
    },
  ];
  return new MockLanguageModelV4({
    doGenerate: (options) => scripted.doGenerate(options),
    doStream: () => Promise.resolve({ stream: simulateReadableStream({ chunks }) }),
  });
}

describe("os invariantes valem em todo cenário, mesmo sem o cenário pedir", () => {
  it(
    "RN09: um agent que cita o chamado de outra pessoa reprova o cenário",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: [scenarioById("duvida-vpn-erro-809")],
        llm: GEMINI_WITHOUT_NETWORK,
        model: modelAnsweringWith("O chamado do Bruno é: Impressora do 3º andar não imprime."),
        limits: UNLIMITED,
        ...NO_WAIT,
      });

      const result = statusOf(report, "duvida-vpn-erro-809");
      expect(result.status).toBe("failed");
      expect(result.failedChecks.map((check) => check.rule)).toContain(
        "RN09: nenhuma resposta expõe chamado de outro funcionário",
      );
      // O cenário esperava a central de ajuda: a tool também não foi chamada.
      expect(result.failedChecks.map((check) => check.rule)).toContain("tools.mustCall");
    },
  );
});

describe("avaliação com falhas do modelo (sem rede: o modelo é falso)", () => {
  it(
    "ADR-0010: 429 vira 'não avaliado', nunca falha de decisão, e interrompe o resto da execução",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: [
          scenarioById("pede-analista"),
          scenarioById("duvida-vpn-erro-809"),
          scenarioById("status-sem-saber-o-numero"),
        ],
        llm: GEMINI_WITHOUT_NETWORK,
        model: failingModel(429),
        limits: { ...UNLIMITED, maxConsecutiveQuotaFailures: 1 },
        ...NO_WAIT,
      });

      expect(statusOf(report, "pede-analista").status).toBe("not_evaluated");
      expect(statusOf(report, "pede-analista").reason).toContain("429");
      expect(statusOf(report, "duvida-vpn-erro-809").reason).toContain("a cota do modelo acabou");
      expect(statusOf(report, "status-sem-saber-o-numero").status).toBe("not_evaluated");
      expect(report.totals).toMatchObject({ failed: 0, passed: 0, notEvaluated: 3 });
      expect(exitCodeOf(report)).toBe(2);
    },
  );

  it(
    "outro erro do modelo (não é cota) é falha do cenário, com o motivo",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: [scenarioById("pede-analista")],
        llm: GEMINI_WITHOUT_NETWORK,
        model: failingModel(400),
        limits: UNLIMITED,
        ...NO_WAIT,
      });

      const result = statusOf(report, "pede-analista");
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("o turno terminou em erro");
      expect(exitCodeOf(report)).toBe(1);
    },
  );

  it(
    "classificador fora do ar deixa o cenário 'não avaliado': a intenção e a confiança seriam só o valor neutro",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: [scenarioById("pede-analista")],
        llm: GEMINI_WITHOUT_NETWORK,
        model: mockModelWithClassifier(() => {
          throw new Error("classificador fora do ar");
        }),
        limits: UNLIMITED,
        ...NO_WAIT,
      });

      const result = statusOf(report, "pede-analista");
      expect(result.status).toBe("not_evaluated");
      expect(result.reason).toContain("o classificador não respondeu");
    },
  );
});

describe("limites de uso do modelo real (ADR-0010)", () => {
  it("espaça o início das mensagens pelo intervalo configurado", { timeout: 60_000 }, async () => {
    const sleeps: number[] = [];
    await runEvaluation({
      scenarios: [
        scenarioById("duvida-vpn-erro-809"),
        scenarioById("pede-analista"),
        scenarioById("pedido-vago-duas-vezes-transfere"),
      ],
      llm: MOCK,
      limits: { ...UNLIMITED, minMsBetweenMessages: 20_000 },
      nowMs: () => 0,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    // 4 mensagens (1 + 1 + 2): espera antes de todas, menos da primeira.
    expect(sleeps).toEqual([20_000, 20_000, 20_000]);
  });

  it(
    "o cenário que não cabe no teto de mensagens da execução é 'não avaliado'; o que cabe roda",
    { timeout: 60_000 },
    async () => {
      const report = await runEvaluation({
        scenarios: [
          scenarioById("pedido-vago-duas-vezes-transfere"),
          scenarioById("duvida-vpn-erro-809"),
          scenarioById("pede-analista"),
        ],
        llm: MOCK,
        limits: { ...UNLIMITED, maxMessages: 1 },
        ...NO_WAIT,
      });

      expect(statusOf(report, "pedido-vago-duas-vezes-transfere").status).toBe("not_evaluated");
      expect(statusOf(report, "pedido-vago-duas-vezes-transfere").reason).toContain(
        "teto de 1 mensagens",
      );
      expect(statusOf(report, "duvida-vpn-erro-809").status).toBe("passed");
      // A mensagem do cenário anterior já consumiu o teto: este não cabe mais.
      expect(statusOf(report, "pede-analista").status).toBe("not_evaluated");
    },
  );

  it("os limites do gemini seguem a cota do ADR-0010: 3 mensagens por minuto e metade das 120 do dia", () => {
    expect(GEMINI_LIMITS.minMsBetweenMessages).toBe(20_000);
    expect(GEMINI_LIMITS.maxMessages).toBeLessThanOrEqual(60);
    expect(GEMINI_LIMITS.maxConsecutiveQuotaFailures).toBeGreaterThanOrEqual(1);
  });

  it("o conjunto inteiro cabe no teto de mensagens do gemini", () => {
    const messages = EVAL_SCENARIOS.reduce((total, scenario) => total + scenario.turns.length, 0);

    expect(messages).toBeLessThanOrEqual(GEMINI_LIMITS.maxMessages);
  });
});
