import { DEMO_USERS } from "@nexo/shared/demo";
import { describe, expect, it } from "vitest";
import type { DecisionTrace } from "../agent/decision-trace.ts";
import { createConversationStore } from "../db/conversation-store.ts";
import { openDatabase } from "../db/database.ts";
import { createDecisionStore } from "../db/decision-store.ts";
import { createHandoffStore } from "../db/handoff-store.ts";
import { createSessionStore } from "../db/session-store.ts";
import { createStatsStore } from "../db/stats-store.ts";
import { createUserStore } from "../db/user-store.ts";
import { createStatsService } from "./stats-service.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const trace = {
  steps: [],
  finalConfidence: 0.9,
  classifierConfidence: 0.9,
} as unknown as DecisionTrace;

async function setup() {
  let now = new Date("2026-10-31T12:00:00Z");
  const clock = { now: () => now };
  const { db } = await openDatabase(":memory:");
  await createUserStore(db).upsertAll(DEMO_USERS);
  const conversations = createConversationStore(db);
  const decisions = createDecisionStore(db);
  const service = createStatsService({ statsStore: createStatsStore(db), clock });

  /** Uma conversa com um turno do agent, de `latencyMs`, gravado em `at`. */
  async function turn(latencyMs: number, at: Date, agentTokens: number | null = 100) {
    const conversation = await conversations.create("emp-ana-souza", at);
    const message = await conversations.appendMessage({
      conversationId: conversation.id,
      author: "agent",
      authorId: null,
      parts: [{ type: "text", text: "ok" }],
      createdAt: at,
    });
    await decisions.create({
      messageId: message.id,
      conversationId: conversation.id,
      conversationVersion: 1,
      trace,
      classifierTokens: 50,
      agentTokens,
      latencyMs,
      createdAt: at,
    });
    return conversation.id;
  }

  async function handOff(conversationId: string, at: Date) {
    await createHandoffStore(db).create({
      id: `h-${conversationId}`,
      conversationId,
      reason: "employee_request",
      supportLevel: "N1",
      problem: "x",
      attempted: "y",
      ticketNumber: null,
      ticketTransferred: false,
      responseDueAt: at,
      createdAt: at,
    });
  }

  return {
    db,
    service,
    turn,
    handOff,
    now: () => now,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

describe("números da tela de login (A11)", () => {
  it("média da resposta do assistente, sem os turnos que falharam sem informar tokens", async () => {
    const { service, turn, now } = await setup();
    await turn(2000, now());
    await turn(4000, now());
    await turn(60_000, now(), null);

    expect((await service.loginStats()).averageReplySeconds).toBe(3);
  });

  it("só a última semana conta", async () => {
    const { service, turn, now } = await setup();
    await turn(2000, new Date(now().getTime() - 8 * DAY_MS));

    expect(await service.loginStats()).toMatchObject({
      averageReplySeconds: null,
      answeredWithoutAnalystPercent: null,
    });
  });

  it("atendidas sem analista: as transferências contam só entre as conversas da janela", async () => {
    const { service, turn, handOff, now } = await setup();
    const first = await turn(1000, now());
    await turn(1000, now());
    await turn(1000, now());
    await turn(1000, now());
    await handOff(first, now());
    // Transferência de uma conversa que não teve turno na janela não entra na conta.
    const old = await turn(1000, new Date(now().getTime() - 10 * DAY_MS));
    await handOff(old, now());

    expect((await service.loginStats()).answeredWithoutAnalystPercent).toBe(75);
  });

  it("guarda o resultado por 30 s e depois recalcula", async () => {
    const { service, turn, now, advance } = await setup();
    expect((await service.loginStats()).averageReplySeconds).toBeNull();
    await turn(5000, now());

    advance(10_000);
    expect((await service.loginStats()).averageReplySeconds).toBeNull();
    advance(25_000);
    expect((await service.loginStats()).averageReplySeconds).toBe(5);
  });

  it("analistas conectados: sessão vencida não conta, funcionário também não", async () => {
    const { db, service, now, advance } = await setup();
    const sessions = createSessionStore(db);
    const hour = 60 * 60 * 1000;
    await sessions.create({
      tokenHash: "rafael",
      userId: "ana-rafael-lima",
      createdAt: now(),
      expiresAt: new Date(now().getTime() + hour),
    });
    await sessions.create({
      tokenHash: "ana",
      userId: "emp-ana-souza",
      createdAt: now(),
      expiresAt: new Date(now().getTime() + hour),
    });
    expect((await service.loginStats()).analystsSignedIn).toBe(1);

    advance(2 * hour);
    expect((await service.loginStats()).analystsSignedIn).toBe(0);
  });
});
