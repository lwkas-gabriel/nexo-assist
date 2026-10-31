import { sendMessageRequestSchema } from "@nexo/shared/contracts";
import { AppError } from "@nexo/shared/errors";
import { parseInput, readJson } from "@nexo/shared/http";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { ChatLimits } from "../app/agent-quota.ts";
import type { ChatService } from "../app/chat-service.ts";
import type { DraftActions } from "../app/draft-actions.ts";
import type { AppEnv } from "./app-env.ts";
import { clientIp } from "./client-ip.ts";
import { currentUser, requireRole } from "./session.ts";

/** Limites de entrada: protegem custo e memória contra abuso (RT10, RT13). */
const MAX_BODY_BYTES = 16 * 1024;

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

  // Os limites de uso são do caso de uso do chat (agent-quota.ts): é ele que sabe, com a conversa
  // travada, se a mensagem vai para o modelo ou para o analista.
  routes.post("/messages", smallBody, async (c) => {
    const employee = currentUser(c, "employee");
    const { text, id } = parseInput(sendMessageRequestSchema, await readJson(c.req));
    const stream = await chatService.sendMessage(employee, text, {
      ip: clientIp(c),
      ...(id ? { messageId: id } : {}),
    });
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
