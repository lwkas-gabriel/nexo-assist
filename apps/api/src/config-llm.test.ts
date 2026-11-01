import { InvalidEnvError } from "@nexo/shared/config";
import { describe, expect, it } from "vitest";
import { loadLlmConfig } from "./config.ts";

describe("loadLlmConfig (config da avaliação do agent)", () => {
  it("no modo mock, só precisa de LLM_MODE (nada de banco, porta nem serviço de chamados)", () => {
    expect(loadLlmConfig({ LLM_MODE: "mock" })).toEqual({ LLM_MODE: "mock" });
  });

  it("no modo gemini, exige a chave e o modelo", () => {
    expect(() => loadLlmConfig({ LLM_MODE: "gemini" })).toThrowError(InvalidEnvError);
    expect(() => loadLlmConfig({ LLM_MODE: "gemini", GEMINI_API_KEY: "x" })).toThrowError(
      /LLM_MODEL/,
    );
    expect(() => loadLlmConfig({ LLM_MODE: "gemini", LLM_MODEL: "m" })).toThrowError(
      /GEMINI_API_KEY/,
    );
  });

  it("no modo gemini, devolve o modelo e a chave informados", () => {
    const config = loadLlmConfig({
      LLM_MODE: "gemini",
      GEMINI_API_KEY: "chave-de-teste",
      LLM_MODEL: "modelo-x",
    });

    expect(config).toEqual({
      LLM_MODE: "gemini",
      GEMINI_API_KEY: "chave-de-teste",
      LLM_MODEL: "modelo-x",
    });
  });

  it("recusa um modo desconhecido, sem repetir o valor recebido na mensagem", () => {
    const secretLooking = "valor-que-nao-deve-aparecer";

    expect(() => loadLlmConfig({ LLM_MODE: secretLooking })).toThrowError(InvalidEnvError);
    try {
      loadLlmConfig({ LLM_MODE: secretLooking });
    } catch (error) {
      expect((error as Error).message).not.toContain(secretLooking);
    }
  });

  it("sem LLM_MODE a avaliação não roda (não há modo padrão)", () => {
    expect(() => loadLlmConfig({})).toThrowError(/LLM_MODE/);
  });
});
