import { join } from "node:path";
import type { Mastra } from "@mastra/core/mastra";
import { DEMO_USERS } from "@nexo/shared/demo";
import { systemClock, type Clock } from "@nexo/shared/domain";
import { createHttpTicketGateway } from "./adapters/http-ticket-gateway.ts";
import { createMarkdownKnowledgeBase } from "./adapters/markdown-knowledge-base.ts";
import { createModel, createNexoMastra } from "./agent/nexo-agent.ts";
import { createAuthService, type AuthService } from "./app/auth-service.ts";
import { createChatService, type ChatService } from "./app/chat-service.ts";
import { createDraftActions, type DraftActions } from "./app/draft-actions.ts";
import { createDraftService } from "./app/draft-service.ts";
import { createHandoffService } from "./app/handoff-service.ts";
import type { LlmConfig } from "./config.ts";
import { createConversationStore, type ConversationStore } from "./db/conversation-store.ts";
import { openDatabase, type Database } from "./db/database.ts";
import { createDraftStore } from "./db/draft-store.ts";
import { createHandoffStore } from "./db/handoff-store.ts";
import { createSessionStore } from "./db/session-store.ts";
import { createUserStore } from "./db/user-store.ts";
import type { ChatLimits } from "./http/chat-routes.ts";
import { createRateLimiter, type RateLimiter } from "./http/rate-limiter.ts";
import type { TicketGateway } from "./ports/ticket-gateway.ts";

/** Pasta com os artigos da central de ajuda, versionados com o código. */
const KNOWLEDGE_DIRECTORY = join(import.meta.dirname, "..", "knowledge");

/**
 * Proteção do deploy público: o login aceita qualquer senha (requisito do desafio).
 * Os tetos globais de mensagens vêm da config (dependem da cota do provedor).
 */
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const CHAT_MESSAGES_PER_USER_PER_HOUR = 30;
const DRAFT_ACTIONS_PER_USER_PER_HOUR = 60;
const LOGINS_PER_IP_PER_MINUTE = 20;

/** O que o container precisa da config: banco, modelo e acesso ao serviço de chamados. */
export type ContainerConfig = LlmConfig & {
  DATABASE_URL: string;
  TICKETS_SERVICE_URL: string;
  TICKETS_SERVICE_TOKEN: string;
  CHAT_MESSAGES_PER_MINUTE: number;
  CHAT_MESSAGES_PER_DAY: number;
};

/** Tudo de que as rotas precisam, criado num único lugar. Nos testes, basta montar outro. */
export type Container = {
  db: Database;
  mastra: Mastra;
  ticketGateway: TicketGateway;
  authService: AuthService;
  chatService: ChatService;
  draftActions: DraftActions;
  conversationStore: ConversationStore;
  chatLimits: ChatLimits;
  loginLimiter: RateLimiter;
};

/** Peças que os testes podem trocar por versões controladas (relógio fixo, sistema de chamados falso). */
export type ContainerOverrides = {
  clock?: Clock;
  ticketGateway?: TicketGateway;
};

export async function createContainer(
  config: ContainerConfig,
  overrides: ContainerOverrides = {},
): Promise<Container> {
  const clock = overrides.clock ?? systemClock;
  const { db } = await openDatabase(config.DATABASE_URL);
  const userStore = createUserStore(db);
  // As pessoas de demonstração são dados de referência: sempre presentes, sempre atualizadas.
  await userStore.upsertAll(DEMO_USERS);

  const conversationStore = createConversationStore(db);
  const knowledgeBase = createMarkdownKnowledgeBase(KNOWLEDGE_DIRECTORY);
  const ticketGateway =
    overrides.ticketGateway ??
    createHttpTicketGateway({
      baseUrl: config.TICKETS_SERVICE_URL,
      serviceToken: config.TICKETS_SERVICE_TOKEN,
    });
  const draftService = createDraftService({
    draftStore: createDraftStore(db),
    ticketGateway,
    clock,
  });
  const handoffService = createHandoffService({
    conversationStore,
    handoffStore: createHandoffStore(db),
    ticketGateway,
    clock,
  });
  const mastra = createNexoMastra({
    model: createModel(config),
    knowledgeBase,
    ticketGateway,
    draftService,
    handoffService,
    clock,
  });

  return {
    db,
    mastra,
    ticketGateway,
    authService: createAuthService({ userStore, sessionStore: createSessionStore(db), clock }),
    chatService: createChatService({ mastra, conversationStore, draftService, clock }),
    draftActions: createDraftActions({ draftService, handoffService, conversationStore, clock }),
    conversationStore,
    chatLimits: {
      perUser: createRateLimiter({
        limit: CHAT_MESSAGES_PER_USER_PER_HOUR,
        windowMs: HOUR_MS,
        clock,
      }),
      globalPerMinute: createRateLimiter({
        limit: config.CHAT_MESSAGES_PER_MINUTE,
        windowMs: MINUTE_MS,
        clock,
      }),
      globalPerDay: createRateLimiter({
        limit: config.CHAT_MESSAGES_PER_DAY,
        windowMs: DAY_MS,
        clock,
      }),
      draftActionsPerUser: createRateLimiter({
        limit: DRAFT_ACTIONS_PER_USER_PER_HOUR,
        windowMs: HOUR_MS,
        clock,
      }),
    },
    loginLimiter: createRateLimiter({
      limit: LOGINS_PER_IP_PER_MINUTE,
      windowMs: MINUTE_MS,
      clock,
    }),
  };
}
