import type { UserRole } from "@nexo/shared/demo";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Espelho tipado das tabelas criadas em migrations/*.sql (fonte da verdade do schema, ADR-0009).
 * O teste de banco aplica as migrações e consulta por aqui: se divergirem, ele quebra.
 */

export const CONVERSATION_MODES = ["agent", "waiting_analyst", "analyst", "closed"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const MESSAGE_AUTHORS = ["employee", "agent", "analyst", "system"] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").$type<UserRole>().notNull(),
  department: text("department").notNull(),
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

export const DRAFT_STATUSES = ["pending", "confirmed", "cancelled"] as const;
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
});

export type DraftRow = typeof drafts.$inferSelect;
