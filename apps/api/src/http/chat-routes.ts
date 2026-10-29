import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse, safeValidateUIMessages } from "ai";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { NEXO_AGENT_ID } from "../agent/nexo-agent.ts";
import type { Container } from "../container.ts";
import { clientIp } from "./client-ip.ts";

/** Limites de entrada: protegem custo e memória contra abuso (RT10, RT13). */
const MAX_BODY_BYTES = 64 * 1024;
/** 30 mensagens do funcionário por sessão (RN14) + as respostas do agent. */
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 2000;

/**
 * Formato mínimo que checamos antes da validação completa do AI SDK: limites de quantidade e tamanho.
 * Provisório: hoje o histórico vem do navegador. Na T09 o servidor passa a ser a fonte da verdade
 * do histórico e o cliente envia só a mensagem nova (evita histórico forjado).
 */
const chatRequestSchema = z.object({
  messages: z
    .array(
      z.looseObject({
        parts: z.array(
          z.looseObject({ type: z.string(), text: z.string().max(MAX_MESSAGE_CHARS).optional() }),
        ),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

function invalidRequest(message: string) {
  return { error: { code: "INVALID_REQUEST", message } };
}

const RATE_LIMITED = {
  error: {
    code: "RATE_LIMITED",
    message: "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
  },
};

export function createChatRoutes({ mastra, chatLimits }: Container) {
  const routes = new Hono();

  routes.post(
    "/",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(invalidRequest("Mensagem grande demais."), 413),
    }),
    async (c) => {
      // Conta antes de validar: requisições inválidas em massa também são abuso.
      const withinLimits =
        chatLimits.perClient.tryConsume(clientIp(c)) && chatLimits.global.tryConsume("global");
      if (!withinLimits) {
        return c.json(RATE_LIMITED, 429);
      }

      const body: unknown = await c.req.json().catch(() => null);

      const limits = chatRequestSchema.safeParse(body);
      if (!limits.success) {
        return c.json(invalidRequest("Conversa inválida ou mensagem longa demais."), 400);
      }

      const validated = await safeValidateUIMessages({ messages: limits.data.messages });
      if (!validated.success) {
        return c.json(invalidRequest("Formato de mensagens inválido."), 400);
      }

      const stream = await handleChatStream({
        mastra,
        agentId: NEXO_AGENT_ID,
        version: "v7",
        params: { messages: validated.data },
      });
      return createUIMessageStreamResponse({ stream });
    },
  );

  return routes;
}
