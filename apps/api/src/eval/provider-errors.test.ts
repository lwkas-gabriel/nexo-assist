import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { classifyProviderError } from "./provider-errors.ts";

function apiError(statusCode: number, isRetryable?: boolean) {
  return new APICallError({
    message: "falha",
    url: "https://provedor.invalid/modelo",
    requestBodyValues: {},
    statusCode,
    ...(isRetryable === undefined ? {} : { isRetryable }),
  });
}

describe("erro do provedor do modelo", () => {
  it("ADR-0010: 429 é cota", () => {
    expect(classifyProviderError(apiError(429))).toBe("quota");
  });

  it("5xx e 408 são indisponibilidade", () => {
    expect(classifyProviderError(apiError(503))).toBe("unavailable");
    expect(classifyProviderError(apiError(500))).toBe("unavailable");
    expect(classifyProviderError(apiError(408))).toBe("unavailable");
  });

  it("4xx que não é cota (chave inválida, pedido malformado) é erro do turno", () => {
    expect(classifyProviderError(apiError(400, false))).toBe("other");
    expect(classifyProviderError(apiError(401, false))).toBe("other");
  });

  it("enxerga o erro original dentro do RetryError do AI SDK", () => {
    const wrapped = new RetryError({
      message: "falhou depois de tentar de novo",
      reason: "maxRetriesExceeded",
      errors: [apiError(429)],
    });

    expect(classifyProviderError(wrapped)).toBe("quota");
  });

  it("tempo esgotado e sobrecarga sem código HTTP são indisponibilidade", () => {
    expect(classifyProviderError(new Error("The model is overloaded"))).toBe("unavailable");
    expect(classifyProviderError(new Error("request timed out"))).toBe("unavailable");
    expect(classifyProviderError(new Error("fetch failed"))).toBe("unavailable");
  });

  it("erro qualquer é do turno", () => {
    expect(classifyProviderError(new Error("saída fora do formato"))).toBe("other");
    expect(classifyProviderError("texto solto")).toBe("other");
    expect(classifyProviderError(undefined)).toBe("other");
  });
});
