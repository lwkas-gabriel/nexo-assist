import { and, eq, gt, lte } from "drizzle-orm";
import type { Database } from "./database.ts";
import { authSessions, users, type UserRow } from "./schema.ts";

/** Sessões de login. Recebe sempre o hash do token, nunca o token em si. */
export function createSessionStore(db: Database) {
  return {
    async create(session: {
      tokenHash: string;
      userId: string;
      createdAt: Date;
      expiresAt: Date;
    }): Promise<void> {
      await db.insert(authSessions).values(session);
    },

    /** Dono de uma sessão ainda válida, ou undefined se não existe ou expirou. */
    async findUser(tokenHash: string, now: Date): Promise<UserRow | undefined> {
      const [row] = await db
        .select({ user: users })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)));
      return row?.user;
    },

    async delete(tokenHash: string): Promise<void> {
      await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
    },

    async deleteExpired(now: Date): Promise<void> {
      await db.delete(authSessions).where(lte(authSessions.expiresAt, now));
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
