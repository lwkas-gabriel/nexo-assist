import type { UserRole } from "@nexo/shared/demo";
import { AppError } from "@nexo/shared/errors";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AuthService } from "../app/auth-service.ts";
import type { UserRow } from "../db/schema.ts";
import type { AppEnv } from "./app-env.ts";

export const SESSION_COOKIE = "nexo_session";

/** Lê o cookie de sessão e deixa o usuário logado disponível para as rotas (ou undefined). */
export function loadSession(authService: AuthService) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set("user", token ? await authService.findUserBySession(token) : undefined);
    await next();
  });
}

/** Exige login e, se informado, um papel: funcionário não entra no console, analista não usa o chat. */
export function requireRole(role: UserRole) {
  return createMiddleware<AppEnv>(async (c, next) => {
    currentUser(c, role);
    await next();
  });
}

/** Usuário logado com o papel exigido; nas rotas protegidas por requireRole, nunca é undefined. */
export function currentUser(c: Context<AppEnv>, role: UserRole): UserRow {
  const user = c.get("user");
  if (!user) {
    throw new AppError("UNAUTHORIZED", "Faça login para continuar.");
  }
  if (user.role !== role) {
    throw new AppError("FORBIDDEN", "Você não tem acesso a esta área.");
  }
  return user;
}
