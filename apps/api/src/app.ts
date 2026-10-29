import { Hono } from "hono";
import type { Container } from "./container.ts";
import { createChatRoutes } from "./http/chat-routes.ts";

/**
 * Monta as rotas sem abrir porta de rede, para poder ser testado com `app.request()`.
 * Tudo fica sob /api: no deploy, o mesmo servidor entrega o front (mesma origem, ver docs/ARCHITECTURE.md 5.2).
 */
export function createApp(container: Container) {
  const app = new Hono().basePath("/api");

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/chat", createChatRoutes(container));

  return app;
}
