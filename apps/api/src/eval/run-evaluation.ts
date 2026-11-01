import type { MastraModelConfig } from "@mastra/core/llm";
import type { LlmConfig } from "../config.ts";
import { describeExpectation, describeObservation, joinTurns } from "./describe.ts";
import { evaluateInvariants, evaluateTurn, type Check } from "./evaluate.ts";
import { createPacer } from "./pacer.ts";
import { buildEvalTickets } from "./fixtures.ts";
import { EVAL_CLOCK_START, playScenario, type ScenarioPlay } from "./run-scenario.ts";
import {
  EVAL_CATEGORIES,
  EVAL_CATEGORY_LABELS,
  type EvalCategory,
  type EvalScenario,
} from "./scenario-schema.ts";

/**
 * Orquestra a avaliação: decide o que roda, respeita a cota do modelo real (ADR-0010), joga cada
 * cenário, avalia e monta o relatório. Falha de cota nunca vira falha de decisão.
 */

export type EvalLimits = {
  /** Intervalo mínimo entre o início de duas mensagens ao modelo. */
  minMsBetweenMessages: number;
  /** Teto de mensagens (cada uma usa até 4 chamadas ao modelo) numa execução. */
  maxMessages: number;
  /** Depois de tantas execuções seguidas sem resposta do provedor (cota ou indisponibilidade), o resto nem tenta. */
  maxConsecutiveProviderFailures: number;
};

/**
 * Cota gratuita do gemini-3.5-flash-lite (ADR-0010): 15 requisições por minuto e 500 por dia, e
 * cada mensagem usa até 4 chamadas. O mesmo teto por minuto do produto (CHAT_MESSAGES_PER_MINUTE).
 */
const GEMINI_MESSAGES_PER_MINUTE = 3;
const MS_PER_MINUTE = 60 * 1000;
/** Metade das 120 mensagens por dia do ADR-0010: sobra cota para o uso do chat no mesmo dia. */
const GEMINI_MAX_MESSAGES_PER_RUN = 60;
const GEMINI_MAX_CONSECUTIVE_PROVIDER_FAILURES = 2;

export const GEMINI_LIMITS: EvalLimits = {
  minMsBetweenMessages: MS_PER_MINUTE / GEMINI_MESSAGES_PER_MINUTE,
  maxMessages: GEMINI_MAX_MESSAGES_PER_RUN,
  maxConsecutiveProviderFailures: GEMINI_MAX_CONSECUTIVE_PROVIDER_FAILURES,
};

/** O modelo falso não gasta cota: sem espera e sem teto. */
export const MOCK_LIMITS: EvalLimits = {
  minMsBetweenMessages: 0,
  maxMessages: Number.POSITIVE_INFINITY,
  maxConsecutiveProviderFailures: Number.POSITIVE_INFINITY,
};

export const MOCK_MODE_WARNING =
  "MODO MOCK: o modelo é um roteiro por palavras-chave. Este resultado só prova que o harness funciona e NÃO mede a qualidade das decisões do modelo. A nota real vem de LLM_MODE=gemini.";

export type ScenarioStatus = "passed" | "failed" | "not_evaluated";

export type ScenarioResult = {
  id: string;
  category: EvalCategory;
  description: string;
  status: ScenarioStatus;
  /** Por que falhou ou não foi avaliado. */
  reason: string | undefined;
  expected: string;
  chosen: string;
  /** As verificações que não passaram. */
  failedChecks: Check[];
};

export type CategorySummary = {
  category: EvalCategory;
  label: string;
  passed: number;
  failed: number;
  notEvaluated: number;
  /** Percentual dos avaliados que passaram; nulo se nenhum foi avaliado. */
  percentPassed: number | null;
};

export type EvaluationReport = {
  mode: LlmConfig["LLM_MODE"];
  /** Modelo usado no modo gemini. Nunca a chave. */
  model: string | null;
  warnings: string[];
  scenarios: ScenarioResult[];
  categories: CategorySummary[];
  totals: { passed: number; failed: number; notEvaluated: number; percentPassed: number | null };
};

const percent = (passed: number, evaluated: number) =>
  evaluated === 0 ? null : Math.round((passed / evaluated) * 100);

function summarize(
  scenarios: readonly ScenarioResult[],
): Pick<EvaluationReport, "categories" | "totals"> {
  const count = (list: readonly ScenarioResult[], status: ScenarioStatus) =>
    list.filter((scenario) => scenario.status === status).length;
  const categories = EVAL_CATEGORIES.map((category) => {
    const inCategory = scenarios.filter((scenario) => scenario.category === category);
    const passed = count(inCategory, "passed");
    const failed = count(inCategory, "failed");
    return {
      category,
      label: EVAL_CATEGORY_LABELS[category],
      passed,
      failed,
      notEvaluated: count(inCategory, "not_evaluated"),
      percentPassed: percent(passed, passed + failed),
    };
  });
  const passed = count(scenarios, "passed");
  const failed = count(scenarios, "failed");
  return {
    categories,
    totals: {
      passed,
      failed,
      notEvaluated: count(scenarios, "not_evaluated"),
      percentPassed: percent(passed, passed + failed),
    },
  };
}

function expectedOf(scenario: EvalScenario): string {
  return joinTurns(scenario.turns.map((turn) => describeExpectation(turn.expect)));
}

function notEvaluated(scenario: EvalScenario, reason: string): ScenarioResult {
  return {
    id: scenario.id,
    category: scenario.category,
    description: scenario.description,
    status: "not_evaluated",
    reason,
    expected: expectedOf(scenario),
    chosen: "—",
    failedChecks: [],
  };
}

type Judgement = {
  status: ScenarioStatus;
  reason?: string;
  failedChecks: Check[];
  /** Não avaliado por cota ou indisponibilidade do provedor (conta para interromper a execução). */
  isProviderTrouble: boolean;
};

const PROVIDER_TROUBLE_REASONS = {
  quota: "cota do modelo esgotada (429)",
  unavailable: "provedor do modelo indisponível (erro 5xx, tempo esgotado ou sobrecarga)",
} as const;

/** O primeiro turno que não rendeu uma decisão completa, com o porquê. */
function firstBrokenTurn(play: ScenarioPlay) {
  for (const [index, turn] of play.turns.entries()) {
    if (turn.failure) return { index, failure: turn.failure, stage: "agent" as const };
    if (turn.classifierFailure) {
      return { index, failure: turn.classifierFailure, stage: "classificador" as const };
    }
  }
  return undefined;
}

/**
 * Compara os turnos jogados com as expectativas do cenário. Os invariantes (RN09, RN04, R04) valem
 * sobre tudo que já aconteceu, mesmo que um turno posterior tenha caído por cota: uma violação já
 * ocorrida não deixa de existir. Só o que falta jogar fica "não avaliado".
 */
function judge(scenario: EvalScenario, play: ScenarioPlay): Judgement {
  const broken = firstBrokenTurn(play);
  const decidedTurns = broken ? play.turns.slice(0, broken.index) : play.turns;
  const observations = play.turns.map((turn) => turn.observation);
  const checks = [
    ...scenario.turns.slice(0, decidedTurns.length).flatMap((scenarioTurn, index) => {
      const played = decidedTurns[index];
      if (!played) return [missingTurnCheck(index + 1)];
      return evaluateTurn(scenarioTurn.expect, played.observation, index + 1);
    }),
    ...evaluateInvariants(observations, {
      employeeId: scenario.employeeId,
      foreignTickets: buildEvalTickets(EVAL_CLOCK_START).filter(
        (ticket) => ticket.ownerId !== scenario.employeeId,
      ),
      employeeMessages: scenario.turns.map((turn) => turn.message),
    }),
  ];
  const failedChecks = checks.filter((item) => !item.passed);
  if (failedChecks.length > 0) return { status: "failed", failedChecks, isProviderTrouble: false };
  if (!broken) return { status: "passed", failedChecks, isProviderTrouble: false };
  if (broken.failure.kind === "other") {
    return {
      status: "failed",
      reason: `o turno ${broken.index + 1} terminou em erro (${broken.stage}): ${broken.failure.detail}`,
      failedChecks,
      isProviderTrouble: false,
    };
  }
  const why = PROVIDER_TROUBLE_REASONS[broken.failure.kind];
  const where = broken.stage === "classificador" ? "o classificador não respondeu: " : "";
  return {
    status: "not_evaluated",
    reason: `${where}${why}`,
    failedChecks,
    isProviderTrouble: true,
  };
}

/** Defeito do harness, nunca do modelo: um turno do cenário que não chegou a ser jogado. */
function missingTurnCheck(turn: number): Check {
  return {
    rule: "harness",
    turn,
    passed: false,
    expected: "o turno foi jogado",
    actual: "o turno não foi jogado",
  };
}

export type EvaluationOptions = {
  scenarios: readonly EvalScenario[];
  llm: LlmConfig;
  /** Só os testes trocam o modelo; a avaliação usa o da config. */
  model?: MastraModelConfig;
  limits: EvalLimits;
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Para a linha de progresso no terminal. */
  onScenarioDone?: (result: ScenarioResult) => void;
};

export async function runEvaluation(options: EvaluationOptions): Promise<EvaluationReport> {
  const { scenarios, llm, limits } = options;
  const isMock = llm.LLM_MODE === "mock";
  const pacer = createPacer({
    minIntervalMs: limits.minMsBetweenMessages,
    nowMs: options.nowMs,
    sleep: options.sleep,
  });
  let sentMessages = 0;
  let consecutiveProviderFailures = 0;
  const results: ScenarioResult[] = [];

  async function evaluate(scenario: EvalScenario): Promise<ScenarioResult> {
    if (isMock && scenario.requiresRealModel) {
      return notEvaluated(scenario, "exige modelo real: o modelo falso não exercita este cenário");
    }
    if (consecutiveProviderFailures >= limits.maxConsecutiveProviderFailures) {
      return notEvaluated(scenario, "execução interrompida: a cota ou o provedor do modelo falhou");
    }
    if (sentMessages + scenario.turns.length > limits.maxMessages) {
      return notEvaluated(
        scenario,
        `teto de ${limits.maxMessages} mensagens por execução (ADR-0010)`,
      );
    }
    const play = await playScenario(scenario, {
      llm,
      ...(options.model ? { model: options.model } : {}),
      beforeMessage: async () => {
        await pacer.waitForTurn();
        sentMessages += 1;
      },
    });
    const judgement = judge(scenario, play);
    consecutiveProviderFailures = judgement.isProviderTrouble ? consecutiveProviderFailures + 1 : 0;
    return {
      id: scenario.id,
      category: scenario.category,
      description: scenario.description,
      status: judgement.status,
      reason: judgement.reason,
      expected: expectedOf(scenario),
      chosen: joinTurns(play.turns.map((turn) => describeObservation(turn.observation))),
      failedChecks: judgement.failedChecks,
    };
  }

  for (const scenario of scenarios) {
    const result = await evaluate(scenario);
    results.push(result);
    options.onScenarioDone?.(result);
  }

  return {
    mode: llm.LLM_MODE,
    model: llm.LLM_MODE === "gemini" ? llm.LLM_MODEL : null,
    warnings: isMock ? [MOCK_MODE_WARNING] : [],
    scenarios: results,
    ...summarize(results),
  };
}
