import type { Database } from "../db/database.ts";
import { ticketUpdates, tickets } from "../db/schema.ts";
import { buildDemoTickets } from "./demo-tickets.ts";

/** Apaga os chamados e grava os de demonstração, numa transação (tudo ou nada). */
export async function seedDatabase(db: Database, now: Date): Promise<number> {
  const demoTickets = buildDemoTickets(now);

  await db.transaction(async (tx) => {
    await tx.delete(ticketUpdates);
    await tx.delete(tickets);

    for (const { updates, ...ticket } of demoTickets) {
      const lastActivity = updates.at(-1)?.at ?? ticket.createdAt;
      const [row] = await tx
        .insert(tickets)
        .values({ ...ticket, updatedAt: lastActivity })
        .returning({ id: tickets.id });
      if (!row) throw new Error(`Falha ao gravar ${ticket.number}`);

      for (const update of updates) {
        await tx.insert(ticketUpdates).values({
          ticketId: row.id,
          author: update.author,
          message: update.message,
          createdAt: update.at,
        });
      }
    }
  });
  return demoTickets.length;
}
