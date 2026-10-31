import { AppError } from "@nexo/shared/errors";
import { parseInput, readJson } from "@nexo/shared/http";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ChatService } from "../app/chat-service.ts";
import type { DraftActions } from "../app/draft-actions.ts";
import type { AppEnv } from "./app-env.ts";
import type { RateLimiter } from "./rate-limiter.ts";
import { currentUser, requireRole } from "./session.ts";

/** Limites de entrada: protegem custo e memória contra abuso (RT10, RT13). */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_CHARS = 2000;

/** O navegador manda só o texto novo; o histórico vem do banco. */
const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

/** Por funcionário, e para todos juntos dentro da cota gratuita do modelo (ADR-0010). */
export type ChatLimits = {
  perUser: RateLimiter;
  globalPerMinute: RateLimiter;
  globalPerDay: RateLimiter;
};

type ChatRoutesDependencies = {
  chatService: ChatService;
  draftActions: DraftActions;
  chatLimits: ChatLimits;
};

/** Número do rascunho na rota: aceita "12" ou "D-12", como aparece no card. */
const draftNumberSchema = z
  .string()
  .regex(/^(?:D-)?\d{1,9}$/i)
  .transform((text) => Number(text.replace(/^D-/i, "")));

/** R16: campos que o funcionário corrige no card. A prioridade não entra: sai da matriz (RN11). */
const editDraftSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    type: z.string(),
    category: z.string(),
    affected: z.string(),
    urgency: z.string(),
  })
  .partial()
  .strict();

const smallBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new AppError("INVALID_REQUEST", "Requisição grande demais.");
  },
});

export function createChatRoutes({
  chatService,
  draftActions,
  chatLimits,
}: ChatRoutesDependencies) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("employee"));

  routes.get("/", async (c) => {
    return c.json(await chatService.getConversation(currentUser(c, "employee")));
  });

  routes.post("/messages", smallBody, async (c) => {
    const employee = currentUser(c, "employee");
    // Conta antes de validar: requisições inválidas em massa também são abuso.
    const withinLimits =
      chatLimits.perUser.tryConsume(employee.id) &&
      chatLimits.globalPerMinute.tryConsume("global") &&
      chatLimits.globalPerDay.tryConsume("global");
    if (!withinLimits) {
      throw new AppError(
        "RATE_LIMITED",
        "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
      );
    }

    const { text } = parseInput(sendMessageSchema, await readJson(c.req));
    const stream = await chatService.sendMessage(employee, text);
    return createUIMessageStreamResponse({ stream });
  });

  // Botões do card de rascunho (RN04, R16): ação determinística, sem chamar o LLM (11.5).
  routes.post("/drafts/:id/confirm", async (c) => {
    const draftNumber = parseInput(draftNumberSchema, c.req.param("id"));
    return c.json(await draftActions.confirm(currentUser(c, "employee").id, draftNumber));
  });

  routes.post("/drafts/:id/cancel", async (c) => {
    const draftNumber = parseInput(draftNumberSchema, c.req.param("id"));
    return c.json({ draft: await draftActions.cancel(currentUser(c, "employee").id, draftNumber) });
  });

  routes.patch("/drafts/:id", smallBody, async (c) => {
    const draftNumber = parseInput(draftNumberSchema, c.req.param("id"));
    const changes = parseInput(editDraftSchema, await readJson(c.req));
    const employeeId = currentUser(c, "employee").id;
    return c.json({ draft: await draftActions.edit(employeeId, draftNumber, changes) });
  });

  return routes;
}
