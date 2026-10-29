import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Container } from "./container.ts";
import { createChatRoutes } from "./http/chat-routes.ts";

type AppOptions = {
  /** Pasta do front já construído (apps/web/dist). Sem ela, só a api responde (desenvolvimento). */
  webDistDirectory?: string;
};

const API_NOT_FOUND = { error: { code: "NOT_FOUND", message: "Rota não encontrada." } };

/**
 * Monta as rotas sem abrir porta de rede, para poder ser testado com `app.request()`.
 * A api fica sob /api e, em produção, o mesmo servidor entrega o front: mesma origem,
 * sem CORS (ver docs/ARCHITECTURE.md 5.2).
 */
export function createApp(container: Container, { webDistDirectory }: AppOptions = {}) {
  const api = new Hono();
  api.get("/health", (c) => c.json({ status: "ok" }));
  api.route("/chat", createChatRoutes(container));

  const app = new Hono();
  app.use("*", secureHeaders());
  app.route("/api", api);
  // Rota de api inexistente responde JSON, nunca o HTML do front.
  app.all("/api/*", (c) => c.json(API_NOT_FOUND, 404));

  if (webDistDirectory) {
    app.use("*", serveStatic({ root: webDistDirectory }));
    // Front é uma SPA: qualquer outra rota abre o index.html e o React decide a tela.
    app.get("*", serveStatic({ root: webDistDirectory, path: "index.html" }));
  }

  return app;
}
