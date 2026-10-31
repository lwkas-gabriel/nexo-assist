import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import {
  GENERIC_AGENT_ERROR_MESSAGE,
  QUOTA_EXCEEDED_MESSAGE,
  describeAgentError,
} from "./agent-errors.ts";

function providerError(statusCode: number, message: string) {
  return new APICallError({
    message,
    url: "https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent",
    requestBodyValues: {},
    statusCode,
  });
}

describe("describeAgentError", () => {
  it("cota do plano gratuito esgotada (429) vira um aviso claro", () => {
    expect(describeAgentError(providerError(429, "RESOURCE_EXHAUSTED"))).toBe(
      QUOTA_EXCEEDED_MESSAGE,
    );
  });

  it("reconhece a cota esgotada mesmo depois das novas tentativas (RetryError)", () => {
    const afterRetries = new RetryError({
      message: "Failed after 2 attempts",
      reason: "maxRetriesExceeded",
      errors: [providerError(429, "RESOURCE_EXHAUSTED"), providerError(429, "RESOURCE_EXHAUSTED")],
    });

    expect(describeAgentError(afterRetries)).toBe(QUOTA_EXCEEDED_MESSAGE);
  });

  it("qualquer outra falha vira uma mensagem genérica, sem detalhes internos", () => {
    const message = describeAgentError(
      providerError(400, "API key not valid. Please pass a valid API key."),
    );

    expect(message).toBe(GENERIC_AGENT_ERROR_MESSAGE);
    expect(message).not.toContain("API key");
  });

  it("erro que nem é do provedor também vira a mensagem genérica", () => {
    expect(describeAgentError(new Error("falha em C:/servidor/arquivo.ts"))).toBe(
      GENERIC_AGENT_ERROR_MESSAGE,
    );
  });
});
