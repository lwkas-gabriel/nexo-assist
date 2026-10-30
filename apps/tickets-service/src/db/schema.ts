import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  AffectedScope,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@nexo/shared/domain";
import type { UpdateAuthor } from "@nexo/shared/contracts";

/**
 * Espelho tipado das tabelas criadas em migrations/*.sql (fonte da verdade do schema).
 * O teste de banco aplica as migrações e consulta por aqui: se divergirem, ele quebra.
 */
export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),
  type: text("type").$type<TicketType>().notNull(),
  sequence: integer("sequence").notNull(),
  ownerId: text("owner_id").notNull(),
  category: text("category").$type<TicketCategory>().notNull(),
  priority: text("priority").$type<TicketPriority>().notNull(),
  status: text("status").$type<TicketStatus>().notNull(),
  affected: text("affected").$type<AffectedScope>().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  lastStaffUpdateAt: integer("last_staff_update_at", { mode: "timestamp_ms" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});

export const ticketUpdates = sqliteTable("ticket_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  author: text("author").$type<UpdateAuthor>().notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type TicketRow = typeof tickets.$inferSelect;
export type TicketUpdateRow = typeof ticketUpdates.$inferSelect;

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  /** 0 enquanto a escrita está em andamento; depois, o status HTTP da resposta guardada. */
  status: integer("status").notNull(),
  body: text("body").notNull(),
  requestHash: text("request_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
