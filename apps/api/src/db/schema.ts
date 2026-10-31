import type { UserRole } from "@nexo/shared/demo";
import type { ConversationMode, HandoffReason, SupportLevel } from "@nexo/shared/domain";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Espelho tipado das tabelas criadas em migrations/*.sql (fonte da verdade do schema, ADR-0009).
 * O teste de banco aplica as migrações e consulta por aqui: se divergirem, ele quebra.
 */

export { CONVERSATION_MODES, type ConversationMode } from "@nexo/shared/domain";

export const MESSAGE_AUTHORS = ["employee", "agent", "analyst", "system"] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").$type<UserRole>().notNull(),
  department: text("department").notNull(),
  /** Última vez que carregou a conversa: "online" no console e o ✓✓ (A20). */
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => users.id),
  mode: text("mode").$type<ConversationMode>().notNull(),
  assignedAnalystId: text("assigned_analyst_id").references(() => users.id),
  version: integer("version").notNull().default(1),
  /** Última vez que um analista abriu a conversa no console: as não lidas contam daí. */
  analystReadAt: integer("analyst_read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  author: text("author").$type<MessageAuthor>().notNull(),
  authorId: text("author_id").references(() => users.id),
  parts: text("parts").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

export const DRAFT_KINDS = ["create", "update", "reopen"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

/**
 * pending → confirming → confirmed; pending → cancelled. Se a escrita falha, confirming →
 * confirm_failed: o chamado pode ter sido criado, então só vale confirmar de novo (R01).
 */
export const DRAFT_STATUSES = [
  "pending",
  "confirming",
  "confirm_failed",
  "confirmed",
  "cancelled",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const drafts = sqliteTable("drafts", {
  number: integer("number").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  employeeId: text("employee_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind").$type<DraftKind>().notNull(),
  ticketNumber: text("ticket_number"),
  content: text("content").notNull(),
  priorityReason: text("priority_reason"),
  status: text("status").$type<DraftStatus>().notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  shownAt: integer("shown_at", { mode: "timestamp_ms" }),
});

export type DraftRow = typeof drafts.$inferSelect;

export const handoffs = sqliteTable("handoffs", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  reason: text("reason").$type<HandoffReason>().notNull(),
  supportLevel: text("support_level").$type<SupportLevel>().notNull(),
  problem: text("problem").notNull(),
  attempted: text("attempted").notNull(),
  ticketNumber: text("ticket_number"),
  ticketTransferred: integer("ticket_transferred", { mode: "boolean" }).notNull(),
  responseDueAt: integer("response_due_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type HandoffRow = typeof handoffs.$inferSelect;

export const decisionTraces = sqliteTable("decision_traces", {
  messageId: text("message_id")
    .primaryKey()
    .references(() => messages.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  trace: text("trace").notNull(),
  finalConfidence: real("final_confidence").notNull(),
  classifierConfidence: real("classifier_confidence"),
  conversationVersion: integer("conversation_version"),
  classifierTokens: integer("classifier_tokens"),
  agentTokens: integer("agent_tokens"),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type DecisionTraceRow = typeof decisionTraces.$inferSelect;

/** "service_ended": o analista encerrou o atendimento (T24, ADR-0007). */
export const SESSION_END_REASONS = ["limit", "inactivity", "new_session", "service_ended"] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  status: text("status").$type<"active" | "ended">().notNull(),
  agentMessages: integer("agent_messages").notNull().default(0),
  summary: text("summary"),
  endedReason: text("ended_reason").$type<SessionEndReason>(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

export type ChatSessionRow = typeof chatSessions.$inferSelect;

export const usageCounters = sqliteTable(
  "usage_counters",
  {
    scope: text("scope").notNull(),
    day: text("day").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.day] })],
);
