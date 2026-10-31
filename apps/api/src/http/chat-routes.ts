import { AppError } from "@nexo/shared/errors";
import { parseInput, readJson } from "@nexo/shared/http";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
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

/**
 * Mensagens para o agent: por funcionário, e para todos juntos dentro da cota gratuita do modelo
 * (ADR-0010). Mensagens para o analista não gastam o modelo: têm só um limite por funcionário, para
 * não consumir a cota de todos (R42). Botões do rascunho: gravam na conversa e no sistema de chamados.
 */
export type ChatLimits = {
  perUser: RateLimiter;
  globalPerMinute: RateLimiter;
  globalPerDay: RateLimiter;
  toAnalystPerUser: RateLimiter;
  draftActionsPerUser: RateLimiter;
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
    const agentReplies = await chatService.agentWillReply(employee);
    // RN14: com a sessão no limite, recusa antes de gastar a cota de uso.
    if (agentReplies) await chatService.assertSessionBelowLimit(employee);
    const withinLimits = agentReplies
      ? chatLimits.perUser.tryConsume(employee.id) &&
        chatLimits.globalPerMinute.tryConsume("global") &&
        chatLimits.globalPerDay.tryConsume("global")
      : chatLimits.toAnalystPerUser.tryConsume(employee.id);
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

  // Ações de botão (card do rascunho, nova sessão): não gastam o modelo, mas gravam na conversa.
  const limitButtonActions = createMiddleware<AppEnv>(async (c, next) => {
    if (!chatLimits.draftActionsPerUser.tryConsume(currentUser(c, "employee").id)) {
      throw new AppError(
        "RATE_LIMITED",
        "Muitas ações em pouco tempo. Tente novamente mais tarde.",
      );
    }
    await next();
  });
  routes.use("/drafts/*", limitButtonActions);
  routes.use("/sessions", limitButtonActions);
  routes.use("/handoff", limitButtonActions);

  // "Falar com um analista" pelo botão: transfere sem o agent (11.5), inclusive no limite da sessão.
  routes.post("/handoff", async (c) => {
    return c.json({ handoff: await chatService.requestAnalyst(currentUser(c, "employee")) });
  });

  // RN14: "Nova sessão", quando a atual chega ao limite ou o funcionário quer recomeçar.
  routes.post("/sessions", async (c) => {
    return c.json({ session: await chatService.startNewSession(currentUser(c, "employee")) });
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
