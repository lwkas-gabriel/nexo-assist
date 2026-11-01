import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

/** Variáveis comuns a todos os casos; o token é aleatório a cada execução. */
const baseEnv = {
  PORT: "3000",
  DATABASE_URL: "file:./data/api.db",
  COOKIE_SECURE: "false",
  SEED_ON_START: "false",
  TICKETS_SERVICE_URL: "http://localhost:3001",
  TICKETS_SERVICE_TOKEN: randomBytes(32).toString("hex"),
  CHAT_MESSAGES_PER_MINUTE: "5",
  CHAT_MESSAGES_PER_DAY: "150",
};

describe("loadConfig", () => {
  it("no modo mock, sobe sem chave do Gemini", () => {
    const config = loadConfig({ ...baseEnv, LLM_MODE: "mock" });

    expect(config).toMatchObject({ PORT: 3000, LLM_MODE: "mock", COOKIE_SECURE: false });
  });

  it("no modo gemini, exige a chave da API", () => {
    expect(() =>
      loadConfig({ ...baseEnv, LLM_MODE: "gemini", LLM_MODEL: "gemini-3.5-flash-lite" }),
    ).toThrowError(/GEMINI_API_KEY/);
  });

  it("no modo gemini, rejeita chave vazia (como vem do .env.example)", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        LLM_MODE: "gemini",
        GEMINI_API_KEY: "",
        LLM_MODEL: "gemini-3.5-flash-lite",
      }),
    ).toThrowError(/GEMINI_API_KEY/);
  });

  it("rejeita modo desconhecido (inclusive o anterior, anthropic)", () => {
    expect(() => loadConfig({ ...baseEnv, LLM_MODE: "anthropic" })).toThrowError(/LLM_MODE/);
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

  it("o limite de logins por minuto é opcional e, quando vem, precisa ser um inteiro positivo", () => {
    const withoutLimit = loadConfig({ ...baseEnv, LLM_MODE: "mock" });
    const withLimit = loadConfig({ ...baseEnv, LLM_MODE: "mock", LOGINS_PER_IP_PER_MINUTE: "60" });

    expect(withoutLimit.LOGINS_PER_IP_PER_MINUTE).toBeUndefined();
    expect(withLimit.LOGINS_PER_IP_PER_MINUTE).toBe(60);
    for (const invalid of ["0", "-1", "muitos", "1.5"]) {
      expect(() =>
        loadConfig({ ...baseEnv, LLM_MODE: "mock", LOGINS_PER_IP_PER_MINUTE: invalid }),
      ).toThrowError(/LOGINS_PER_IP_PER_MINUTE/);
    }
  });

  it("exige COOKIE_SECURE explícito (true ou false), sem valor padrão no código", () => {
    expect(() => loadConfig({ ...baseEnv, COOKIE_SECURE: "sim", LLM_MODE: "mock" })).toThrowError(
      /COOKIE_SECURE/,
    );
  });
});
