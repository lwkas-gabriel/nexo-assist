import { DEMO_USERS } from "@nexo/shared/demo";
import { systemClock } from "@nexo/shared/domain";
import { APICallError, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { GENERIC_AGENT_ERROR_MESSAGE, QUOTA_EXCEEDED_MESSAGE } from "../agent/agent-errors.ts";
import { createNexoMastra } from "../agent/nexo-agent.ts";
import { createConversationStore } from "../db/conversation-store.ts";
import { openDatabase } from "../db/database.ts";
import type { MessageRow } from "../db/schema.ts";
import { createDraftStore } from "../db/draft-store.ts";
import { createHandoffStore } from "../db/handoff-store.ts";
import { createUserStore } from "../db/user-store.ts";
import { createFakeTicketGateway } from "../test-support.ts";
import { createDraftService } from "./draft-service.ts";
import { createHandoffService } from "./handoff-service.ts";
import { createChatService, toAgentHistoryMessage } from "./chat-service.ts";

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
  const { db } = await openDatabase(":memory:");
  const userStore = createUserStore(db);
  await userStore.upsertAll(DEMO_USERS);
  const employee = await userStore.findById("emp-ana-souza");
  if (!employee) throw new Error("Ana não está nos dados de demonstração");

  const { ticketGateway } = createFakeTicketGateway();
  const draftService = createDraftService({
    draftStore: createDraftStore(db),
    ticketGateway,
    clock: systemClock,
  });
  const conversationStore = createConversationStore(db);
  const chatService = createChatService({
    mastra: createNexoMastra({
      model,
      knowledgeBase: { search: () => [] },
      ticketGateway,
      draftService,
      handoffService: createHandoffService({
        conversationStore,
        handoffStore: createHandoffStore(db),
        ticketGateway,
        clock: systemClock,
      }),
      conversationStore,
      clock: systemClock,
    }),
    conversationStore,
    draftService,
    clock: systemClock,
  });

  const stream = await chatService.sendMessage(employee, "Minha VPN dá erro 809");
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
