import { AppError } from "@nexo/shared/errors";
import { parseInput, readJson } from "@nexo/shared/http";
import { createUIMessageStreamResponse } from "ai";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ChatService } from "../app/chat-service.ts";
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

export type ChatLimits = {
  perUser: RateLimiter;
  global: RateLimiter;
};

type ChatRoutesDependencies = {
  chatService: ChatService;
  chatLimits: ChatLimits;
};

export function createChatRoutes({ chatService, chatLimits }: ChatRoutesDependencies) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("employee"));

  routes.get("/", async (c) => {
    return c.json(await chatService.getConversation(currentUser(c, "employee")));
  });

  routes.post(
    "/messages",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new AppError("INVALID_REQUEST", "Mensagem grande demais.");
      },
    }),
    async (c) => {
      const employee = currentUser(c, "employee");
      // Conta antes de validar: requisições inválidas em massa também são abuso.
      if (!chatLimits.perUser.tryConsume(employee.id) || !chatLimits.global.tryConsume("global")) {
        throw new AppError(
          "RATE_LIMITED",
          "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
        );
      }

      const { text } = parseInput(sendMessageSchema, await readJson(c.req));
      const stream = await chatService.sendMessage(employee, text);
      return createUIMessageStreamResponse({ stream });
    },
  );

  return routes;
}
