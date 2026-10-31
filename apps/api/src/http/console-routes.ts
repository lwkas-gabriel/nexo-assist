import { parseInput } from "@nexo/shared/http";
import { Hono } from "hono";
import { z } from "zod";
import { CONSOLE_FILTERS, type ConsoleService } from "../app/console-service.ts";
import type { AppEnv } from "./app-env.ts";
import { currentUser, requireRole } from "./session.ts";

const listQuerySchema = z.object({
  filter: z.enum(CONSOLE_FILTERS).default("all"),
  q: z.string().max(80).default(""),
});

const conversationIdSchema = z.string().min(1).max(64);

/**
 * Console do analista (telas 4 e 5). Só analistas entram: funcionário recebe 403.
 * A T23 lê (lista, conversa, chamados); assumir, responder, devolver e encerrar vêm na T24.
 */
export function createConsoleRoutes({ consoleService }: { consoleService: ConsoleService }) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("analyst"));

  // RF18: lista com filtros e contagem, e busca por nome, setor ou chamado.
  routes.get("/conversations", async (c) => {
    const { filter, q } = parseInput(listQuerySchema, {
      filter: c.req.query("filter"),
      q: c.req.query("q"),
    });
    const analyst = currentUser(c, "analyst");
    return c.json(await consoleService.list(analyst, { filter, query: q }));
  });

  // RF19, R28: a conversa com o histórico e os registros de decisão; abrir marca como lida.
  routes.get("/conversations/:id", async (c) => {
    const id = parseInput(conversationIdSchema, c.req.param("id"));
    return c.json(await consoleService.detail(currentUser(c, "analyst"), id));
  });

  // RF21: os chamados do funcionário da conversa (A15).
  routes.get("/conversations/:id/tickets", async (c) => {
    const id = parseInput(conversationIdSchema, c.req.param("id"));
    return c.json(await consoleService.tickets(currentUser(c, "analyst"), id));
  });

  return routes;
}
