import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("no modo mock, sobe sem chave da Anthropic", () => {
    const config = loadConfig({ PORT: "3000", LLM_MODE: "mock" });

    expect(config).toEqual({ PORT: 3000, LLM_MODE: "mock" });
  });

  it("no modo anthropic, exige a chave da API", () => {
    expect(() =>
      loadConfig({ PORT: "3000", LLM_MODE: "anthropic", LLM_MODEL: "claude-haiku-5-5" }),
    ).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("no modo anthropic, rejeita chave vazia (como vem do .env.example)", () => {
    expect(() =>
      loadConfig({
        PORT: "3000",
        LLM_MODE: "anthropic",
        ANTHROPIC_API_KEY: "",
        LLM_MODEL: "claude-haiku-5-5",
      }),
    ).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("rejeita modo desconhecido", () => {
    expect(() => loadConfig({ PORT: "3000", LLM_MODE: "openai" })).toThrowError(/LLM_MODE/);
  });
});
