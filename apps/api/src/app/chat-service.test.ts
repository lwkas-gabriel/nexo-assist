import { APICallError, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GENERIC_AGENT_ERROR_MESSAGE, QUOTA_EXCEEDED_MESSAGE } from "../agent/agent-errors.ts";
import { messages, type MessageRow } from "../db/schema.ts";
import { createTestContainer, recordingMockModel } from "../test-support.ts";
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

describe("conversa sem mensagens", () => {
  it("abre vazia, sem erro (a primeira mensagem pode ter sido recusada)", async () => {
    const { chatService, authService, conversationStore } = await createTestContainer();
    const { user: employee } = await authService.login({
      email: "ana.souza@nexo.com.br",
      password: "x",
      remember: false,
    });
    await conversationStore.create(employee.id, new Date());

    const view = await chatService.getConversation(employee);

    expect(view.conversation).not.toBeNull();
    expect(view.messages).toEqual([]);
  });
});

describe("ids das mensagens", () => {
  async function setup() {
    const { chatService, authService } = await createTestContainer();
    const { user: employee } = await authService.login({
      email: "ana.souza@nexo.com.br",
      password: "x",
      remember: false,
    });
    /** Envia e lê o stream até o fim; devolve o id da resposta do agent. */
    async function send(text: string, messageId: string) {
      const stream = await chatService.sendMessage(employee, text, { ip: "local", messageId });
      let streamMessageId: string | undefined;
      const reader = stream.getReader();
      for (let result = await reader.read(); !result.done; result = await reader.read()) {
        if (result.value.type === "start") streamMessageId = result.value.messageId;
      }
      return streamMessageId;
    }
    const employeeTexts = async () =>
      (await chatService.getConversation(employee)).messages
        .filter((message) => message.role === "user")
        .map((message) => message.parts);
    return { chatService, employee, send, employeeTexts };
  }

  it("a conversa recarregada mantém os ids da tela: a do funcionário e a do stream", async () => {
    const { chatService, employee, send } = await setup();

    const streamMessageId = await send("Como configuro a VPN?", "msg-da-tela");

    const { messages } = await chatService.getConversation(employee);
    expect(messages.map((message) => message.id)).toEqual(["msg-da-tela", streamMessageId]);
  });

  it("reenviar a mesma mensagem (Tentar novamente) não a grava duas vezes", async () => {
    const { send, employeeTexts } = await setup();

    await send("Como configuro a VPN?", "msg-da-tela");
    await send("Como configuro a VPN?", "msg-da-tela");

    expect(await employeeTexts()).toHaveLength(1);
  });

  it("id repetido com outro texto não é reenvio: grava a mensagem nova", async () => {
    const { send, employeeTexts } = await setup();

    await send("Como configuro a VPN?", "msg-da-tela");
    await send("E o e-mail no celular?", "msg-da-tela");

    expect(await employeeTexts()).toEqual([
      [{ type: "text", text: "Como configuro a VPN?" }],
      [{ type: "text", text: "E o e-mail no celular?" }],
    ]);
  });
});

describe("reenvio de uma mensagem já gravada (Tentar novamente)", () => {
  async function setup() {
    const { model, agentCalls } = recordingMockModel();
    const { chatService, authService, db } = await createTestContainer({ model });
    const { user: employee } = await authService.login({
      email: "ana.souza@nexo.com.br",
      password: "x",
      remember: false,
    });
    async function send(text: string, messageId: string) {
      const stream = await chatService.sendMessage(employee, text, { ip: "local", messageId });
      const reader = stream.getReader();
      let chunks = 0;
      for (let result = await reader.read(); !result.done; result = await reader.read()) chunks++;
      return chunks;
    }
    const view = async () => {
      const { messages: shown, session } = await chatService.getConversation(employee);
      return { roles: shown.map((message) => message.role), counted: session?.agentMessages };
    };
    return { db, send, view, agentCalls };
  }

  it("RN14: reenviar depois de um turno completo não duplica a resposta nem conta de novo", async () => {
    const { send, view, agentCalls } = await setup();
    await send("Como configuro a VPN?", "msg-da-tela");
    const callsAfterTurn = agentCalls();

    const chunks = await send("Como configuro a VPN?", "msg-da-tela");

    expect(chunks).toBe(0);
    expect(await view()).toEqual({ roles: ["user", "assistant"], counted: 1 });
    expect(agentCalls()).toBe(callsAfterTurn);
  });

  it("o reenvio de uma mensagem sem resposta roda o agent e conta uma vez só", async () => {
    const { db, send, view, agentCalls } = await setup();
    await send("Como configuro a VPN?", "msg-da-tela");
    // O servidor caiu no meio do turno: a mensagem ficou gravada e a resposta, não.
    await db.delete(messages).where(eq(messages.author, "agent"));
    expect(await view()).toEqual({ roles: ["user"], counted: 1 });
    const callsBeforeRetry = agentCalls();

    await send("Como configuro a VPN?", "msg-da-tela");

    expect(await view()).toEqual({ roles: ["user", "assistant"], counted: 1 });
    expect(agentCalls()).toBeGreaterThan(callsBeforeRetry);
  });

  it("a mesma mensagem com outro id é mensagem nova: roda o agent e conta", async () => {
    const { send, view } = await setup();
    await send("Como configuro a VPN?", "msg-1");

    await send("Como configuro a VPN?", "msg-2");

    expect(await view()).toEqual({
      roles: ["user", "assistant", "user", "assistant"],
      counted: 2,
    });
  });
});

describe("conversa com um turno em andamento", () => {
  it("diz que está ocupada enquanto o agent responde, e livre depois", async () => {
    const { chatService, authService } = await createTestContainer();
    const { user: employee } = await authService.login({
      email: "ana.souza@nexo.com.br",
      password: "x",
      remember: false,
    });
    const stream = await chatService.sendMessage(employee, "Como configuro a VPN?", {
      ip: "local",
    });

    const during = await chatService.getConversation(employee);
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      // lê o stream até o fim: o turno termina
    }
    const after = await chatService.getConversation(employee);

    expect(during.isBusy).toBe(true);
    expect(after.isBusy).toBe(false);
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
