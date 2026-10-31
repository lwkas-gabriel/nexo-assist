import { randomUUID } from "node:crypto";
import { MAX_UPDATE_MESSAGE_CHARS } from "@nexo/shared/contracts";
import { URGENCY_LEVELS, ticketDraftSchema } from "@nexo/shared/domain";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./database.ts";
import { drafts, type DraftKind, type DraftRow, type DraftStatus } from "./schema.ts";

/**
 * O que o agent extrai para um chamado novo: os campos da RN03, menos a prioridade, mais a
 * urgência. A prioridade não vem do agent: sai da matriz (RN11).
 */
export const newTicketInputSchema = ticketDraftSchema
  .omit({ priority: true })
  .extend({ urgency: z.enum(URGENCY_LEVELS) });

/** Rascunho de chamado novo como fica gravado: o que o agent extraiu mais a prioridade calculada. */
export const newTicketContentSchema = newTicketInputSchema.extend({
  priority: ticketDraftSchema.shape.priority,
});
export type NewTicketContent = z.infer<typeof newTicketContentSchema>;

/** Complemento de um chamado existente (atualizar ou reabrir). */
export const ticketUpdateContentSchema = z.object({
  message: z.string().trim().min(1).max(MAX_UPDATE_MESSAGE_CHARS),
});
export type TicketUpdateContent = z.infer<typeof ticketUpdateContentSchema>;

/** Rascunho já lido do banco, com o conteúdo validado conforme o tipo. */
export type Draft = Omit<DraftRow, "content" | "kind"> &
  (
    | { kind: "create"; content: NewTicketContent }
    | { kind: "update" | "reopen"; content: TicketUpdateContent }
  );

function toDraft(row: DraftRow): Draft {
  const raw: unknown = JSON.parse(row.content);
  return row.kind === "create"
    ? { ...row, kind: row.kind, content: newTicketContentSchema.parse(raw) }
    : { ...row, kind: row.kind, content: ticketUpdateContentSchema.parse(raw) };
}

export type NewDraft = {
  conversationId: string;
  employeeId: string;
  now: Date;
} & (
  | { kind: "create"; content: NewTicketContent; priorityReason: string }
  | { kind: Exclude<DraftKind, "create">; content: TicketUpdateContent; ticketNumber: string }
);

export function createDraftStore(db: Database) {
  async function findRow(number: number) {
    return db.query.drafts.findFirst({ where: eq(drafts.number, number) });
  }

  return {
    async create(draft: NewDraft): Promise<Draft> {
      const [row] = await db
        .insert(drafts)
        .values({
          conversationId: draft.conversationId,
          employeeId: draft.employeeId,
          kind: draft.kind,
          ticketNumber: draft.kind === "create" ? null : draft.ticketNumber,
          content: JSON.stringify(draft.content),
          priorityReason: draft.kind === "create" ? draft.priorityReason : null,
          status: "pending",
          idempotencyKey: randomUUID(),
          createdAt: draft.now,
          updatedAt: draft.now,
        })
        .returning();
      if (!row) throw new Error("Falha ao gravar o rascunho");
      return toDraft(row);
    },

    async find(number: number): Promise<Draft | undefined> {
      const row = await findRow(number);
      return row ? toDraft(row) : undefined;
    },

    /** Só um rascunho pendente por conversa: propor outro descarta o anterior. */
    async cancelPendingInConversation(conversationId: string, now: Date): Promise<void> {
      await db
        .update(drafts)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(drafts.conversationId, conversationId), eq(drafts.status, "pending")));
    },

    async updateContent(
      number: number,
      content: NewTicketContent,
      priorityReason: string,
      now: Date,
    ): Promise<Draft> {
      const [row] = await db
        .update(drafts)
        .set({ content: JSON.stringify(content), priorityReason, updatedAt: now })
        .where(eq(drafts.number, number))
        .returning();
      if (!row) throw new Error(`Rascunho D-${number} sumiu durante a edição`);
      return toDraft(row);
    },

    async setStatus(
      number: number,
      status: Exclude<DraftStatus, "pending">,
      now: Date,
      ticketNumber?: string,
    ): Promise<Draft> {
      const [row] = await db
        .update(drafts)
        .set({ status, ...(ticketNumber ? { ticketNumber } : {}), updatedAt: now })
        .where(eq(drafts.number, number))
        .returning();
      if (!row) throw new Error(`Rascunho D-${number} sumiu durante a mudança de status`);
      return toDraft(row);
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
