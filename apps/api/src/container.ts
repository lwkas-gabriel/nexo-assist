import { join } from "node:path";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { Mastra } from "@mastra/core/mastra";
import { DEMO_USERS } from "@nexo/shared/demo";
import { systemClock, type Clock } from "@nexo/shared/domain";
import { createHttpTicketGateway } from "./adapters/http-ticket-gateway.ts";
import { createMarkdownKnowledgeBase } from "./adapters/markdown-knowledge-base.ts";
import { createClassifier } from "./agent/classifier.ts";
import { createModel, createNexoMastra } from "./agent/nexo-agent.ts";
import { createAuthService, type AuthService } from "./app/auth-service.ts";
import { createChatService, type ChatService } from "./app/chat-service.ts";
import { createConsoleActions, type ConsoleActions } from "./app/console-actions.ts";
import { createConsoleService, type ConsoleService } from "./app/console-service.ts";
import { createConversationLocks } from "./app/conversation-locks.ts";
import { createConversationReader } from "./app/conversation-reader.ts";
import { createChatSessionService } from "./app/chat-session-service.ts";
import { createDecisionService } from "./app/decision-service.ts";
import { createDraftActions, type DraftActions } from "./app/draft-actions.ts";
import { createDraftService } from "./app/draft-service.ts";
import { createStatsService, type StatsService } from "./app/stats-service.ts";
import { createHandoffService } from "./app/handoff-service.ts";
import type { LlmConfig } from "./config.ts";
import { createChatSessionStore } from "./db/chat-session-store.ts";
import { createConversationStore, type ConversationStore } from "./db/conversation-store.ts";
import { openDatabase, type Database } from "./db/database.ts";
import { createDecisionStore } from "./db/decision-store.ts";
import { createDraftStore } from "./db/draft-store.ts";
import { createHandoffStore } from "./db/handoff-store.ts";
import { createSessionStore } from "./db/session-store.ts";
import { createStatsStore } from "./db/stats-store.ts";
import { createUsageCounterStore } from "./db/usage-counter-store.ts";
import { createUserStore } from "./db/user-store.ts";
import { createAgentQuota, type ChatLimits } from "./app/agent-quota.ts";
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
const CHAT_MESSAGES_PER_USER_PER_HOUR = 30;
/** Um pouco mais que um funcionário: cabe uma sala com IP compartilhado, não todas as contas de uma vez. */
const CHAT_MESSAGES_PER_IP_PER_HOUR = 60;
/**
 * Bem abaixo do teto global do dia (120): uma pessoa num IP não esgota o dia de todos sozinha.
 * Cabem uns 2 funcionários por IP, o bastante para quem divide a rede do escritório.
 */
const CHAT_MESSAGES_PER_IP_PER_DAY = 40;
const DRAFT_ACTIONS_PER_USER_PER_HOUR = 60;
const MESSAGES_TO_ANALYST_PER_USER_PER_HOUR = 60;
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
  consoleService: ConsoleService;
  consoleActions: ConsoleActions;
  mastra: Mastra;
  ticketGateway: TicketGateway;
  authService: AuthService;
  chatService: ChatService;
  draftActions: DraftActions;
  statsService: StatsService;
  conversationStore: ConversationStore;
  chatLimits: ChatLimits;
  loginLimiter: RateLimiter;
};

/**
 * Peças que os testes podem trocar por versões controladas (relógio fixo, sistema de chamados
 * falso, modelo que falha).
 */
export type ContainerOverrides = {
  clock?: Clock;
  ticketGateway?: TicketGateway;
  model?: MastraModelConfig;
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
  const model = overrides.model ?? createModel(config);
  const draftStore = createDraftStore(db);
  const handoffStore = createHandoffStore(db);
  const draftService = createDraftService({
    draftStore,
    ticketGateway,
    clock,
  });
  const handoffService = createHandoffService({
    conversationStore,
    handoffStore,
    ticketGateway,
    clock,
  });
  const decisionStore = createDecisionStore(db);
  // Uma ação por vez em cada conversa, entre o chat e o console (R06).
  const locks = createConversationLocks();
  const chatSessionService = createChatSessionService({
    chatSessionStore: createChatSessionStore(db),
    conversationStore,
    decisionStore,
    clock,
  });
  const decisionService = createDecisionService({ decisionStore, handoffService, clock });
  // Limites em memória por janela curta; os tetos diários ficam no banco (agent-quota.ts).
  const chatLimits: ChatLimits = {
    perUser: createRateLimiter({
      limit: CHAT_MESSAGES_PER_USER_PER_HOUR,
      windowMs: HOUR_MS,
      clock,
    }),
    perIp: createRateLimiter({ limit: CHAT_MESSAGES_PER_IP_PER_HOUR, windowMs: HOUR_MS, clock }),
    globalPerMinute: createRateLimiter({
      limit: config.CHAT_MESSAGES_PER_MINUTE,
      windowMs: MINUTE_MS,
      clock,
    }),
    toAnalystPerUser: createRateLimiter({
      limit: MESSAGES_TO_ANALYST_PER_USER_PER_HOUR,
      windowMs: HOUR_MS,
      clock,
    }),
    draftActionsPerUser: createRateLimiter({
      limit: DRAFT_ACTIONS_PER_USER_PER_HOUR,
      windowMs: HOUR_MS,
      clock,
    }),
  };
  const quota = createAgentQuota({
    limits: chatLimits,
    dailyCaps: { global: config.CHAT_MESSAGES_PER_DAY, perIp: CHAT_MESSAGES_PER_IP_PER_DAY },
    usageCounterStore: createUsageCounterStore(db),
    clock,
  });
  const mastra = createNexoMastra({
    model,
    knowledgeBase,
    ticketGateway,
    draftService,
    handoffService,
    conversationStore,
    clock,
  });

  return {
    db,
    // Tela 5: assumir, responder, devolver e encerrar (RF20).
    consoleActions: createConsoleActions({
      conversationStore,
      handoffStore,
      ticketGateway,
      chatSessionService,
      locks,
      clock,
    }),
    // Console do analista (tela 4): leitura das conversas e dos chamados de quem está nelas.
    consoleService: createConsoleService({
      conversationStore,
      handoffStore,
      decisionStore,
      draftStore,
      draftService,
      ticketGateway,
      conversationReader: createConversationReader({
        conversationStore,
        decisionService,
        userStore,
      }),
      clock,
    }),
    mastra,
    ticketGateway,
    authService: createAuthService({ userStore, sessionStore: createSessionStore(db), clock }),
    chatService: createChatService({
      mastra,
      conversationStore,
      draftService,
      handoffService,
      // Etapa 1 do turno (R05): o mesmo modelo, numa chamada curta e com saída estruturada.
      classifier: createClassifier(model),
      decisionService,
      quota,
      ticketGateway,
      userStore,
      locks,
      chatSessionService,
      clock,
    }),
    draftActions: createDraftActions({
      locks,
      draftService,
      handoffService,
      decisionService,
      conversationStore,
      clock,
    }),
    conversationStore,
    chatLimits,
    statsService: createStatsService({ statsStore: createStatsStore(db), clock }),
    loginLimiter: createRateLimiter({
      limit: LOGINS_PER_IP_PER_MINUTE,
      windowMs: MINUTE_MS,
      clock,
    }),
  };
}
