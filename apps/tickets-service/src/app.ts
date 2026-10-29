import { Hono } from "hono";

/** Monta as rotas sem abrir porta de rede, para poder ser testado com `app.request()`. */
export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}
