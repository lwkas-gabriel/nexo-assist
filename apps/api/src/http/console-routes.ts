import { Hono } from "hono";
import type { ConversationStore } from "../db/conversation-store.ts";
import type { AppEnv } from "./app-env.ts";
import { requireRole } from "./session.ts";

/**
 * Console do analista (telas 4 e 5). Só analistas entram: funcionário recebe 403.
 * Esta primeira rota lista as conversas em andamento; assumir, devolver e encerrar vêm nas T23 e T24.
 */
export function createConsoleRoutes({
  conversationStore,
}: {
  conversationStore: ConversationStore;
}) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("analyst"));

  routes.get("/conversations", async (c) => {
    const conversations = await conversationStore.listOpenForConsole();
    return c.json({
      conversations: conversations.map((conversation) => ({
        ...conversation,
        updatedAt: conversation.updatedAt.toISOString(),
      })),
    });
  });

  return routes;
}
