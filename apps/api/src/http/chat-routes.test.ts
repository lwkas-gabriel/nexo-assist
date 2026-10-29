import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createContainer } from "../container.ts";
import { systemClock } from "@nexo/shared/domain";
import { createRateLimiter } from "./rate-limiter.ts";

const app = createApp(createContainer({ LLM_MODE: "mock" }));

function postChat(body: unknown) {
  return app.request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function userMessage(text: string) {
  return { id: "m1", role: "user", parts: [{ type: "text", text }] };
}

describe("POST /api/chat", () => {
  it("responde em streaming, mostrando a busca na central de ajuda e a resposta", async () => {
    const response = await postChat({ messages: [userMessage("VPN com erro 809")] });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await response.text();
    expect(stream).toContain("search_knowledge_base");
    expect(stream).toContain("VPN com erro 809");
  });

  it("recusa corpo que não é uma conversa", async () => {
    const response = await postChat({ foo: "bar" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("recusa mensagem longa demais (protege custo)", async () => {
    const response = await postChat({ messages: [userMessage("a".repeat(2001))] });

    expect(response.status).toBe(400);
  });

  it("recusa conversa com mensagens demais", async () => {
    const messages = Array.from({ length: 61 }, (_, index) => ({
      ...userMessage("oi"),
      id: `m${index}`,
    }));

    const response = await postChat({ messages });

    expect(response.status).toBe(400);
  });

  it("recusa JSON malformado sem derrubar o servidor", async () => {
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ isso não é json",
    });

    expect(response.status).toBe(400);
  });

  it("bloqueia com 429 quem passa do limite de mensagens", async () => {
    const strictLimiter = createRateLimiter({ limit: 1, windowMs: 60_000, clock: systemClock });
    const container = createContainer({ LLM_MODE: "mock" });
    const limitedApp = createApp({
      ...container,
      chatLimits: { ...container.chatLimits, perClient: strictLimiter },
    });
    const request = () =>
      limitedApp.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [userMessage("oi")] }),
      });

    expect((await request()).status).toBe(200);
    const blocked = await request();

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
});
