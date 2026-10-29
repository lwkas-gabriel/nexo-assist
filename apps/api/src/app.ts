import { Hono } from "hono";

/**
 * Monta as rotas sem abrir porta de rede, para poder ser testado com `app.request()`.
 * Tudo fica sob /api: no deploy, o mesmo servidor entrega o front (mesma origem, ver docs/ARCHITECTURE.md 5.2).
 */
export function createApp() {
  const app = new Hono().basePath("/api");

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}
