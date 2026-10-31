import { sql } from "drizzle-orm";
import type { Database } from "./database.ts";
import { usageCounters } from "./schema.ts";

export function createUsageCounterStore(db: Database) {
  return {
    /**
     * Soma 1 ao contador do dia, num único comando, só se ele ainda estiver abaixo do limite.
     * Duas mensagens simultâneas não passam juntas do teto. Devolve se coube.
     */
    async tryIncrement(scope: string, day: string, limit: number): Promise<boolean> {
      const rows = await db
        .insert(usageCounters)
        .values({ scope, day, count: 1 })
        .onConflictDoUpdate({
          target: [usageCounters.scope, usageCounters.day],
          set: { count: sql`${usageCounters.count} + 1` },
          setWhere: sql`${usageCounters.count} < ${limit}`,
        })
        .returning({ count: usageCounters.count });
      return rows.length > 0 && limit > 0;
    },
  };
}

export type UsageCounterStore = ReturnType<typeof createUsageCounterStore>;
