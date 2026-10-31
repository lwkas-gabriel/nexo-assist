import { serveStatic } from "@hono/node-server/serve-static";
import { AppError, errorBody } from "@nexo/shared/errors";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Container } from "./container.ts";
import type { AppEnv } from "./http/app-env.ts";
import { createAuthRoutes } from "./http/auth-routes.ts";
import { createChatRoutes } from "./http/chat-routes.ts";
import { createConsoleRoutes } from "./http/console-routes.ts";
import { rejectCrossOriginWrites } from "./http/same-origin.ts";
import { loadSession } from "./http/session.ts";

type AppOptions = {
  /** Cookie de sessão só por HTTPS (produção). */
  cookieSecure: boolean;
  /** Pasta do front já construído (apps/web/dist). Sem ela, só a api responde (desenvolvimento). */
  webDistDirectory?: string;
};

/**
 * Monta as rotas sem abrir porta de rede, para poder ser testado com `app.request()`.
 * A api fica sob /api e, em produção, o mesmo servidor entrega o front: mesma origem,
 * sem CORS (ver docs/ARCHITECTURE.md 5.2).
 */
export function createApp(container: Container, { cookieSecure, webDistDirectory }: AppOptions) {
  const api = new Hono<AppEnv>();
  api.use("*", rejectCrossOriginWrites());
  api.use("*", loadSession(container.authService));

  api.get("/health", (c) => c.json({ status: "ok" }));
  // Números da tela de login (A11): públicos, agregados e sem dado de pessoa.
  api.get("/stats", async (c) => c.json(await container.statsService.loginStats()));
  api.route(
    "/auth",
    createAuthRoutes({
      authService: container.authService,
      loginLimiter: container.loginLimiter,
      cookieSecure,
    }),
  );
  api.route("/chat", createChatRoutes(container));
  api.route("/console", createConsoleRoutes(container));
  // Rota de api inexistente responde JSON, nunca o HTML do front.
  api.all("*", (c) => c.json(errorBody("NOT_FOUND", "Rota não encontrada."), 404));

  const app = new Hono();
  app.use("*", secureHeaders());
  app.route("/api", api);

  if (webDistDirectory) {
    app.use("*", serveStatic({ root: webDistDirectory }));
    // Front é uma SPA: qualquer outra rota abre o index.html e o React decide a tela.
    app.get("*", serveStatic({ root: webDistDirectory, path: "index.html" }));
  }

  // Único ponto que transforma erros em respostas HTTP.
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(errorBody(error.code, error.message), error.httpStatus);
    }
    console.error("Erro inesperado na api", error);
    return c.json(errorBody("INTERNAL", "Erro interno."), 500);
  });

  return app;
}
