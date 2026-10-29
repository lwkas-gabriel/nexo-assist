import { DEMO_USERS } from "@nexo/shared/demo";
import { describe, expect, it } from "vitest";
import { createConversationStore } from "./conversation-store.ts";
import { openDatabase } from "./database.ts";
import { createSessionStore } from "./session-store.ts";
import { createUserStore } from "./user-store.ts";

const ANA = "emp-ana-souza";
const at = (iso: string) => new Date(iso);

async function setup() {
  const { db } = await openDatabase(":memory:");
  const userStore = createUserStore(db);
  await userStore.upsertAll(DEMO_USERS);
  return {
    userStore,
    sessionStore: createSessionStore(db),
    conversationStore: createConversationStore(db),
  };
}

describe("usuários", () => {
  it("encontra pelo e-mail sem diferenciar maiúsculas e espaços", async () => {
    const { userStore } = await setup();

    const user = await userStore.findByEmail("  Ana.Souza@NEXO.com.br ");

    expect(user).toMatchObject({ id: ANA, name: "Ana Souza", department: "Financeiro" });
  });

  it("gravar as pessoas de demonstração de novo não duplica nem falha", async () => {
    const { userStore } = await setup();

    await userStore.upsertAll(DEMO_USERS);

    expect(await userStore.findById(ANA)).toBeDefined();
  });
});

describe("sessões de login", () => {
  it("devolve o dono de uma sessão válida, e nada depois que expira", async () => {
    const { sessionStore } = await setup();
    await sessionStore.create({
      tokenHash: "hash-1",
      userId: ANA,
      createdAt: at("2026-10-29T10:00:00Z"),
      expiresAt: at("2026-10-29T22:00:00Z"),
    });

    expect(await sessionStore.findUser("hash-1", at("2026-10-29T12:00:00Z"))).toMatchObject({
      id: ANA,
    });
    expect(await sessionStore.findUser("hash-1", at("2026-10-29T22:00:00Z"))).toBeUndefined();
  });

  it("apagar a sessão desloga", async () => {
    const { sessionStore } = await setup();
    const now = at("2026-10-29T10:00:00Z");
    await sessionStore.create({
      tokenHash: "hash-2",
      userId: ANA,
      createdAt: now,
      expiresAt: at("2026-10-30T10:00:00Z"),
    });

    await sessionStore.delete("hash-2");

    expect(await sessionStore.findUser("hash-2", now)).toBeUndefined();
  });
});

describe("conversas", () => {
  it("cria uma conversa com o agent e guarda as mensagens em ordem", async () => {
    const { conversationStore } = await setup();
    const conversation = await conversationStore.create(ANA, at("2026-10-29T10:00:00Z"));

    await conversationStore.appendMessage({
      conversationId: conversation.id,
      author: "employee",
      authorId: ANA,
      parts: [{ type: "text", text: "Minha VPN não conecta" }],
      createdAt: at("2026-10-29T10:00:01Z"),
    });
    await conversationStore.appendMessage({
      conversationId: conversation.id,
      author: "agent",
      authorId: null,
      parts: [{ type: "text", text: "Vou verificar." }],
      createdAt: at("2026-10-29T10:00:05Z"),
    });

    const stored = await conversationStore.listRecentMessages(conversation.id, 10);
    expect(conversation.mode).toBe("agent");
    expect(stored.map((message) => message.author)).toEqual(["employee", "agent"]);
    expect(await conversationStore.findOpenByEmployee(ANA)).toMatchObject({
      id: conversation.id,
      updatedAt: at("2026-10-29T10:00:05Z"),
    });
  });

  it("devolve só as mensagens mais recentes, em ordem cronológica", async () => {
    const { conversationStore } = await setup();
    const conversation = await conversationStore.create(ANA, at("2026-10-29T10:00:00Z"));
    for (const second of [1, 2, 3]) {
      await conversationStore.appendMessage({
        conversationId: conversation.id,
        author: "employee",
        authorId: ANA,
        parts: [{ type: "text", text: "mensagem " + String(second) }],
        createdAt: at("2026-10-29T10:00:0" + String(second) + "Z"),
      });
    }

    const recent = await conversationStore.listRecentMessages(conversation.id, 2);

    expect(recent.map((message) => JSON.parse(message.parts) as unknown)).toEqual([
      [{ type: "text", text: "mensagem 2" }],
      [{ type: "text", text: "mensagem 3" }],
    ]);
  });
});
