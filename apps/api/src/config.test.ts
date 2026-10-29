import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

/** Variáveis comuns a todos os casos; o token é aleatório a cada execução. */
const baseEnv = {
  PORT: "3000",
  TICKETS_SERVICE_URL: "http://localhost:3001",
  TICKETS_SERVICE_TOKEN: randomBytes(32).toString("hex"),
};

describe("loadConfig", () => {
  it("no modo mock, sobe sem chave da Anthropic", () => {
    const config = loadConfig({ ...baseEnv, LLM_MODE: "mock" });

    expect(config).toMatchObject({ PORT: 3000, LLM_MODE: "mock" });
  });

  it("no modo anthropic, exige a chave da API", () => {
    expect(() =>
      loadConfig({ ...baseEnv, LLM_MODE: "anthropic", LLM_MODEL: "claude-haiku-5-5" }),
    ).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("no modo anthropic, rejeita chave vazia (como vem do .env.example)", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        LLM_MODE: "anthropic",
        ANTHROPIC_API_KEY: "",
        LLM_MODEL: "claude-haiku-5-5",
      }),
    ).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it("rejeita modo desconhecido", () => {
    expect(() => loadConfig({ ...baseEnv, LLM_MODE: "openai" })).toThrowError(/LLM_MODE/);
  });

  it("exige o token do serviço de chamados", () => {
    expect(() =>
      loadConfig({ ...baseEnv, TICKETS_SERVICE_TOKEN: "", LLM_MODE: "mock" }),
    ).toThrowError(/TICKETS_SERVICE_TOKEN/);
  });

  it("rejeita endereço inválido do serviço de chamados", () => {
    expect(() =>
      loadConfig({ ...baseEnv, TICKETS_SERVICE_URL: "não é url", LLM_MODE: "mock" }),
    ).toThrowError(/TICKETS_SERVICE_URL/);
  });
});
