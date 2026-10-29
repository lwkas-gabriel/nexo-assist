import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./database.ts";
import { runMigrations } from "./migrate.ts";
import { ticketUpdates, tickets } from "./schema.ts";
import { join } from "node:path";

const now = new Date("2026-10-29T12:00:00Z");

describe("banco do serviço de chamados", () => {
  it("aplica as migrações e o schema do Drizzle bate com o SQL (grava e lê)", async () => {
    const { db } = await openDatabase(":memory:");

    const [created] = await db
      .insert(tickets)
      .values({
        number: "INC-20311",
        type: "incident",
        sequence: 20311,
        ownerId: "emp-ana-souza",
        category: "hardware",
        priority: "medium",
        status: "waiting_analyst",
        affected: "just_me",
        title: "Notebook lento após atualização do Windows",
        description: "Lentidão geral desde a atualização.",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db
      .insert(ticketUpdates)
      .values({ ticketId: created!.id, author: "staff", message: "Analisando", createdAt: now });

    const stored = await db.query.tickets.findFirst({ where: eq(tickets.number, "INC-20311") });
    expect(stored).toMatchObject({ ownerId: "emp-ana-souza", createdAt: now, resolvedAt: null });
  });

  it("não reaplica migrações já aplicadas", async () => {
    const { client } = await openDatabase(":memory:");

    const pending = await runMigrations(
      client,
      join(import.meta.dirname, "..", "..", "migrations"),
    );

    expect(pending).toEqual([]);
  });
});
