import {
  addTicketUpdateRequestSchema,
  createTicketRequestSchema,
  ownerOnlyRequestSchema,
  ticketFilterSchema,
  transferTicketRequestSchema,
} from "@nexo/shared/contracts";
import { Hono } from "hono";
import { z } from "zod";
import type { TicketService } from "../app/ticket-service.ts";
import { parseInput, readJson } from "@nexo/shared/http";

const listQuerySchema = z.object({ ownerId: z.string().min(1), filter: ticketFilterSchema });

export function createTicketRoutes(ticketService: TicketService) {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const { ownerId, filter } = parseInput(listQuerySchema, c.req.query());
    return c.json({ tickets: await ticketService.list(ownerId, filter) });
  });

  routes.get("/:number", async (c) => {
    const { ownerId } = parseInput(ownerOnlyRequestSchema, c.req.query());
    return c.json(await ticketService.get(ownerId, c.req.param("number")));
  });

  routes.post("/", async (c) => {
    const { ownerId, draft } = parseInput(createTicketRequestSchema, await readJson(c.req));
    return c.json(await ticketService.create(ownerId, draft), 201);
  });

  routes.post("/:number/updates", async (c) => {
    const { ownerId, author, message } = parseInput(
      addTicketUpdateRequestSchema,
      await readJson(c.req),
    );
    return c.json(await ticketService.addUpdate(ownerId, c.req.param("number"), author, message));
  });

  routes.post("/:number/reopen", async (c) => {
    const { ownerId } = parseInput(ownerOnlyRequestSchema, await readJson(c.req));
    return c.json(await ticketService.reopen(ownerId, c.req.param("number")));
  });

  routes.post("/:number/transfer", async (c) => {
    const { ownerId, summary } = parseInput(transferTicketRequestSchema, await readJson(c.req));
    return c.json(await ticketService.transfer(ownerId, c.req.param("number"), summary));
  });

  return routes;
}
