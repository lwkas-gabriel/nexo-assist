import type { DemoUser } from "@nexo/shared/demo";
import { eq } from "drizzle-orm";
import type { Database } from "./database.ts";
import { users, type UserRow } from "./schema.ts";

/** E-mails comparados sem diferença de maiúsculas e espaços ("Ana.Souza@nexo.com.br "). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUserStore(db: Database) {
  return {
    async findByEmail(email: string): Promise<UserRow | undefined> {
      return db.query.users.findFirst({ where: eq(users.email, normalizeEmail(email)) });
    },

    async findById(id: string): Promise<UserRow | undefined> {
      return db.query.users.findFirst({ where: eq(users.id, id) });
    },

    /** Garante que as pessoas de demonstração existam, com os dados atuais (idempotente). */
    async upsertAll(people: readonly DemoUser[]): Promise<void> {
      for (const person of people) {
        const row = { ...person, email: normalizeEmail(person.email) };
        await db.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
      }
    },
  };
}

export type UserStore = ReturnType<typeof createUserStore>;
