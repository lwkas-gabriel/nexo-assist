import { AppError } from "@nexo/shared/errors";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AuthService } from "../app/auth-service.ts";
import { toUserDto, type AppEnv } from "./app-env.ts";
import { clientIp } from "./client-ip.ts";
import type { RateLimiter } from "./rate-limiter.ts";
import { SESSION_COOKIE } from "./session.ts";
import { parseInput, readJson } from "@nexo/shared/http";

const loginSchema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

type AuthRoutesDependencies = {
  authService: AuthService;
  loginLimiter: RateLimiter;
  /** Cookie só por HTTPS em produção (no desenvolvimento local é HTTP). */
  cookieSecure: boolean;
};

export function createAuthRoutes({
  authService,
  loginLimiter,
  cookieSecure,
}: AuthRoutesDependencies) {
  const routes = new Hono<AppEnv>();
  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "Lax",
    path: "/",
  } as const;

  routes.post("/login", async (c) => {
    if (!loginLimiter.tryConsume(clientIp(c))) {
      throw new AppError(
        "RATE_LIMITED",
        "Muitas tentativas de login. Tente novamente em instantes.",
      );
    }
    const input = parseInput(loginSchema, await readJson(c.req));
    const { token, user, expiresAt, isPersistent } = await authService.login(input);

    setCookie(c, SESSION_COOKIE, token, {
      ...cookieOptions,
      // Sem data de expiração, o cookie some ao fechar o navegador.
      ...(isPersistent ? { expires: expiresAt } : {}),
    });
    return c.json({ user: toUserDto(user) });
  });

  routes.post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await authService.logout(token);
    deleteCookie(c, SESSION_COOKIE, cookieOptions);
    return c.json({ ok: true });
  });

  routes.get("/me", (c) => {
    const user = c.get("user");
    if (!user) {
      throw new AppError("UNAUTHORIZED", "Faça login para continuar.");
    }
    return c.json({ user: toUserDto(user) });
  });

  return routes;
}
