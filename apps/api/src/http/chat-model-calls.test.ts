import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createMockModel } from "../agent/mock-model.ts";
import { createFakeTicketGateway, createTestApp, createTestContainer } from "../test-support.ts";

/** Quantas vezes o modelo é chamado numa mensagem: é a base dos tetos de uso (ADR-0010). */
async function callsForOneMessage(model: MockLanguageModelV4, counter: { calls: number }) {
  const container = await createTestContainer({
    model,
    ticketGateway: createFakeTicketGateway().ticketGateway,
  });
  const { app, login } = await createTestApp(container);
  const cookie = await login("ana.souza@nexo.com.br");
  await (
    await app.request("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text: "Qual o horário do service desk?" }),
    })
  ).text();
  return counter.calls;
}

describe("chamadas ao modelo por mensagem (ADR-0010)", () => {
  it("falha passageira do provedor: no máximo 2 tentativas em cada etapa, não 6", async () => {
    const counter = { calls: 0 };
    const unavailable = () => {
      counter.calls += 1;
      return Promise.reject(
        new APICallError({
          message: "indisponível",
          url: "https://provedor",
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
        }),
      );
    };
    const model = new MockLanguageModelV4({ doGenerate: unavailable, doStream: unavailable });

    // Classificador (2 tentativas) + agent (2 tentativas).
    expect(await callsForOneMessage(model, counter)).toBe(4);
  }, 30_000);

  it("o agent para em 3 passos, mesmo que o modelo peça tools sem parar", async () => {
    const counter = { calls: 0 };
    const scripted = createMockModel();
    const alwaysSearch = new MockLanguageModelV4({
      doGenerate: (options) => {
        counter.calls += 1;
        return scripted.doGenerate(options);
      },
      // Toda resposta do agent é mais uma busca na central de ajuda.
      doStream: (options) => {
        counter.calls += 1;
        const withoutToolResults = options.prompt.filter((message) => message.role !== "tool");
        return scripted.doStream({ ...options, prompt: withoutToolResults });
      },
    });

    // Classificador (1) + agent (3 passos).
    expect(await callsForOneMessage(alwaysSearch, counter)).toBe(4);
  });
});
