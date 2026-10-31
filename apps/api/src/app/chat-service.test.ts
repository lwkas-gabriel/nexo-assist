import { APICallError, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { GENERIC_AGENT_ERROR_MESSAGE, QUOTA_EXCEEDED_MESSAGE } from "../agent/agent-errors.ts";
import type { MessageRow } from "../db/schema.ts";
import { createTestContainer } from "../test-support.ts";
import { keepWithinCharBudget, toAgentHistoryMessage } from "./chat-service.ts";

/** Modelo que sempre falha como o provedor falharia (chave inválida, cota esgotada...). */
function failingModel(statusCode: number, message: string) {
  return new MockLanguageModelV4({
    doStream: () =>
      Promise.reject(
        new APICallError({
          message,
          url: "https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent",
          requestBodyValues: {},
          statusCode,
        }),
      ),
  });
}

async function chatChunksWith(model: MockLanguageModelV4): Promise<UIMessageChunk[]> {
  const { chatService, authService } = await createTestContainer({ model });
  const { user: employee } = await authService.login({
    email: "ana.souza@nexo.com.br",
    password: "x",
    remember: false,
  });

  const stream = await chatService.sendMessage(employee, "Minha VPN dá erro 809", { ip: "local" });
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (let result = await reader.read(); !result.done; result = await reader.read()) {
    chunks.push(result.value);
  }
  return chunks;
}

const errorTexts = (chunks: UIMessageChunk[]) =>
  chunks.flatMap((chunk) => (chunk.type === "error" ? [chunk.errorText] : []));

describe("falhas do modelo no chat", () => {
  it("não vaza a mensagem do provedor nem o stack trace para o navegador", async () => {
    const chunks = await chatChunksWith(
      failingModel(400, "API key not valid. Please pass a valid API key."),
    );

    expect(errorTexts(chunks)).toEqual([GENERIC_AGENT_ERROR_MESSAGE]);
    expect(JSON.stringify(chunks)).not.toMatch(/API key|stack|node_modules/);
  });

  // Inclui a espera de uma nova tentativa do AI SDK antes de desistir.
  it(
    "cota gratuita esgotada vira um aviso claro para o funcionário",
    { timeout: 15_000 },
    async () => {
      const chunks = await chatChunksWith(failingModel(429, "RESOURCE_EXHAUSTED"));

      expect(errorTexts(chunks)).toEqual([QUOTA_EXCEEDED_MESSAGE]);
    },
  );
});

describe("ids das mensagens", () => {
  it("a conversa recarregada mantém os ids da tela: a do funcionário e a do stream", async () => {
    const { chatService, authService } = await createTestContainer();
    const { user: employee } = await authService.login({
      email: "ana.souza@nexo.com.br",
      password: "x",
      remember: false,
    });

    const stream = await chatService.sendMessage(employee, "Como configuro a VPN?", {
      ip: "local",
      messageId: "msg-da-tela",
    });
    let streamMessageId: string | undefined;
    const reader = stream.getReader();
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      if (result.value.type === "start") streamMessageId = result.value.messageId;
    }

    const { messages } = await chatService.getConversation(employee);
    expect(messages.map((message) => message.id)).toEqual(["msg-da-tela", streamMessageId]);
  });
});

describe("histórico que o agent recebe (R18)", () => {
  const row = (author: MessageRow["author"], text: string): MessageRow => ({
    id: `m-${author}`,
    conversationId: "c-1",
    author,
    authorId: null,
    parts: JSON.stringify([{ type: "text", text }]),
    createdAt: new Date("2026-10-27T12:00:00Z"),
  });

  it("R18: mensagens do analista e registros do sistema chegam marcados para o agent", () => {
    expect(toAgentHistoryMessage(row("analyst", "Reinstalei o cliente de VPN."))).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "[Mensagem do analista] Reinstalei o cliente de VPN." }],
    });
    expect(toAgentHistoryMessage(row("system", "Conversa transferida."))).toMatchObject({
      parts: [{ type: "text", text: "[Registro do sistema] Conversa transferida." }],
    });
  });

  it("mensagens do funcionário e do agent chegam como foram escritas", () => {
    expect(toAgentHistoryMessage(row("employee", "oi"))).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "oi" }],
    });
    expect(toAgentHistoryMessage(row("agent", "Olá!"))).toMatchObject({
      parts: [{ type: "text", text: "Olá!" }],
    });
  });
});

describe("orçamento de texto do histórico (ADR-0010)", () => {
  const message = (id: string, size: number) => ({
    id,
    role: "user" as const,
    parts: [{ type: "text" as const, text: "x".repeat(size) }],
  });

  it("fica com as mensagens mais novas que cabem, na ordem da conversa", () => {
    const kept = keepWithinCharBudget(
      [message("1", 600), message("2", 500), message("3", 400)],
      1000,
    );

    expect(kept.map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("a mensagem mais nova entra sempre, mesmo maior que o orçamento", () => {
    expect(keepWithinCharBudget([message("1", 10), message("2", 5000)], 1000)).toHaveLength(1);
  });
});
