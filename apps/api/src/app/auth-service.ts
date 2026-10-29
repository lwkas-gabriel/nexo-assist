import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { UserRow } from "../db/schema.ts";
import type { SessionStore } from "../db/session-store.ts";
import type { UserStore } from "../db/user-store.ts";

const HOUR_MS = 60 * 60 * 1000;
/** Sem "manter conectado", a sessão dura um expediente; com ele, 30 dias. */
const SESSION_TTL_MS = 12 * HOUR_MS;
const REMEMBERED_SESSION_TTL_MS = 30 * 24 * HOUR_MS;

/** O banco guarda só o hash: quem ler o banco não consegue usar o token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type LoginInput = { email: string; password: string; remember: boolean };

export type LoginResult = {
  token: string;
  user: UserRow;
  expiresAt: Date;
  /** Cookie persistente ("manter conectado") ou só enquanto o navegador estiver aberto. */
  isPersistent: boolean;
};

type AuthServiceDependencies = {
  userStore: UserStore;
  sessionStore: SessionStore;
  clock: Clock;
};

export function createAuthService({ userStore, sessionStore, clock }: AuthServiceDependencies) {
  return {
    /**
     * Requisito do desafio: aceita qualquer senha (não vazia) para os funcionários de demonstração.
     * A mensagem de erro é a mesma para e-mail desconhecido: não revela quem tem conta (R44).
     */
    async login({ email, password, remember }: LoginInput): Promise<LoginResult> {
      const user = await userStore.findByEmail(email);
      if (!user || password.length === 0) {
        throw new AppError("UNAUTHORIZED", "E-mail ou senha inválidos.");
      }

      const now = clock.now();
      await sessionStore.deleteExpired(now);

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(
        now.getTime() + (remember ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS),
      );
      await sessionStore.create({
        tokenHash: hashToken(token),
        userId: user.id,
        createdAt: now,
        expiresAt,
      });
      return { token, user, expiresAt, isPersistent: remember };
    },

    async findUserBySession(token: string): Promise<UserRow | undefined> {
      return sessionStore.findUser(hashToken(token), clock.now());
    },

    async logout(token: string): Promise<void> {
      await sessionStore.delete(hashToken(token));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
