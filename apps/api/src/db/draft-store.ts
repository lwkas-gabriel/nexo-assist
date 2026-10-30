import { randomUUID } from "node:crypto";
import { MAX_UPDATE_MESSAGE_CHARS } from "@nexo/shared/contracts";
import { URGENCY_LEVELS, ticketDraftSchema } from "@nexo/shared/domain";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
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
export type Draft = Omit<DraftRow, "content" | "kind" | "ticketNumber"> &
  (
    | { kind: "create"; content: NewTicketContent; ticketNumber: string | null }
    | { kind: "update" | "reopen"; content: TicketUpdateContent; ticketNumber: string }
  );

function toDraft(row: DraftRow): Draft {
  const raw: unknown = JSON.parse(row.content);
  if (row.kind === "create") {
    return { ...row, kind: row.kind, content: newTicketContentSchema.parse(raw) };
  }
  if (!row.ticketNumber) throw new Error(`Rascunho D-${row.number} sem chamado alvo`);
  return {
    ...row,
    kind: row.kind,
    ticketNumber: row.ticketNumber,
    content: ticketUpdateContentSchema.parse(raw),
  };
}

export type NewDraft = {
  conversationId: string;
  employeeId: string;
  now: Date;
} & (
  | { kind: "create"; content: NewTicketContent; priorityReason: string }
  | { kind: Exclude<DraftKind, "create">; content: TicketUpdateContent; ticketNumber: string }
);

/**
 * As mudanças de status só acontecem se o rascunho ainda estiver no status esperado, num único
 * UPDATE: duas ações simultâneas (duplo clique, botão e chat juntos) não passam as duas (R01).
 */
export function createDraftStore(db: Database) {
  async function updateIf(
    number: number,
    expected: DraftStatus[],
    values: Partial<typeof drafts.$inferInsert>,
  ): Promise<Draft | undefined> {
    const [row] = await db
      .update(drafts)
      .set(values)
      .where(and(eq(drafts.number, number), inArray(drafts.status, expected)))
      .returning();
    return row ? toDraft(row) : undefined;
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
      const row = await db.query.drafts.findFirst({ where: eq(drafts.number, number) });
      return row ? toDraft(row) : undefined;
    },

    /** Só um rascunho pendente por conversa: propor outro descarta o anterior. */
    async cancelPendingInConversation(conversationId: string, now: Date): Promise<void> {
      await db
        .update(drafts)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(drafts.conversationId, conversationId), eq(drafts.status, "pending")));
    },

    /** R04: o funcionário viu estes rascunhos pendentes da conversa (a resposta que os mostra terminou). */
    async markShown(conversationId: string, numbers: number[], now: Date): Promise<void> {
      if (numbers.length === 0) return;
      await db
        .update(drafts)
        .set({ shownAt: now })
        .where(
          and(
            eq(drafts.conversationId, conversationId),
            inArray(drafts.number, numbers),
            eq(drafts.status, "pending"),
            isNull(drafts.shownAt),
          ),
        );
    },

    /** Edição pelo card: quem editou viu o resultado, então conta como mostrado agora. */
    updateContent(number: number, content: NewTicketContent, priorityReason: string, now: Date) {
      return updateIf(number, ["pending"], {
        content: JSON.stringify(content),
        priorityReason,
        updatedAt: now,
        shownAt: now,
      });
    },

    /**
     * Reserva o rascunho para executar a confirmação. Aceita pendente, confirmação que falhou
     * (repetir com a mesma chave) e reserva abandonada antes de `staleBefore` (o processo caiu).
     */
    async claimForConfirmation(number: number, now: Date, staleBefore: Date) {
      const [row] = await db
        .update(drafts)
        .set({ status: "confirming", updatedAt: now })
        .where(
          and(
            eq(drafts.number, number),
            or(
              inArray(drafts.status, ["pending", "confirm_failed"]),
              and(eq(drafts.status, "confirming"), lt(drafts.updatedAt, staleBefore)),
            ),
          ),
        )
        .returning();
      return row ? toDraft(row) : undefined;
    },

    finishConfirmation(number: number, ticketNumber: string, now: Date) {
      return updateIf(number, ["confirming"], {
        status: "confirmed",
        ticketNumber,
        updatedAt: now,
      });
    },

    failConfirmation(number: number, now: Date) {
      return updateIf(number, ["confirming"], { status: "confirm_failed", updatedAt: now });
    },

    cancel(number: number, now: Date) {
      return updateIf(number, ["pending"], { status: "cancelled", updatedAt: now });
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
