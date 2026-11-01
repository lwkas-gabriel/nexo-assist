import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { playScenario } from "./run-scenario.ts";
import { EVAL_SCENARIOS } from "./scenarios.ts";

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

describe("executor de um cenário", () => {
  it(
    "para no primeiro turno que falhou: os seguintes não são jogados nem contados",
    { timeout: 30_000 },
    async () => {
      const scenario = EVAL_SCENARIOS.find((item) => item.turns.length > 1);
      if (!scenario) throw new Error("nenhum cenário com mais de um turno");
      let sent = 0;

      const play = await playScenario(scenario, {
        llm: { LLM_MODE: "mock" },
        model: failingModel(400),
        beforeMessage: () => {
          sent += 1;
          return Promise.resolve();
        },
      });

      expect(play.turns).toHaveLength(1);
      expect(play.turns[0]?.failure?.kind).toBe("other");
      expect(sent).toBe(1);
    },
  );
});
