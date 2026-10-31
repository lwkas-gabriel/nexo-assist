import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../db/database.ts";
import { createUsageCounterStore } from "../db/usage-counter-store.ts";
import { createRateLimiter } from "../http/rate-limiter.ts";
import { createAgentQuota, type DailyCaps } from "./agent-quota.ts";

const HOUR_MS = 60 * 60 * 1000;

async function setup(dailyCaps: DailyCaps, databaseUrl = ":memory:") {
  let now = new Date("2026-10-31T15:00:00Z");
  const clock = { now: () => now };
  const generous = () => createRateLimiter({ limit: 1000, windowMs: HOUR_MS, clock });
  const { db } = await openDatabase(databaseUrl);
  const quota = createAgentQuota({
    limits: {
      perUser: generous(),
      perIp: generous(),
      globalPerMinute: generous(),
      toAnalystPerUser: generous(),
      draftActionsPerUser: generous(),
    },
    dailyCaps,
    usageCounterStore: createUsageCounterStore(db),
    clock,
  });
  const send = (employeeId: string, ip: string) => quota.tryConsumeForAgent({ employeeId, ip });
  return { send, setNow: (iso: string) => (now = new Date(iso)) };
}

describe("tetos diários da cota do modelo (ADR-0010, A13)", () => {
  it("A13: o teto diário por IP vale para todas as contas daquele IP", async () => {
    const { send } = await setup({ global: 100, perIp: 2 });

    const results = [
      await send("emp-ana-souza", "203.0.113.7"),
      await send("emp-bruno-tavares", "203.0.113.7"),
      await send("emp-carla-mendes", "203.0.113.7"),
      await send("emp-carla-mendes", "198.51.100.4"),
    ];

    expect(results).toEqual([true, true, false, true]);
  });

  it("o teto global soma todos os IPs", async () => {
    const { send } = await setup({ global: 2, perIp: 100 });

    const results = [
      await send("emp-ana-souza", "203.0.113.7"),
      await send("emp-bruno-tavares", "198.51.100.4"),
      await send("emp-carla-mendes", "192.0.2.10"),
    ];

    expect(results).toEqual([true, true, false]);
  });

  it("o dia é o da cota do Gemini: vira à meia-noite do Pacífico, não 24 h depois da primeira", async () => {
    const { send, setNow } = await setup({ global: 1, perIp: 100 });
    // 31/10 às 23:00 no Pacífico.
    setNow("2026-11-01T06:00:00Z");
    await send("emp-ana-souza", "203.0.113.7");

    // Uma hora depois já é outro dia da cota.
    setNow("2026-11-01T07:00:00Z");

    expect(await send("emp-ana-souza", "203.0.113.7")).toBe(true);
  });

  it("o contador sobrevive a um reinício da api (fica no banco)", async () => {
    const databaseUrl = `file:${join(mkdtempSync(join(tmpdir(), "nexo-quota-")), "api.db")}`;
    const before = await setup({ global: 1, perIp: 100 }, databaseUrl);
    await before.send("emp-ana-souza", "203.0.113.7");

    const after = await setup({ global: 1, perIp: 100 }, databaseUrl);

    expect(await after.send("emp-bruno-tavares", "198.51.100.4")).toBe(false);
  });

  it("mensagens simultâneas não passam juntas do teto", async () => {
    const { send } = await setup({ global: 3, perIp: 100 });

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) => send(`emp-${index}`, `192.0.2.${index}`)),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
