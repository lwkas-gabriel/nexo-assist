import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import type { TicketDto, UpdateAuthor } from "@nexo/shared/contracts";
import {
  OPEN_TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  checkReopen,
  formatTicketNumber,
  isOpenStatus,
  type Clock,
  type TicketDraft,
  type TicketType,
} from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { Database } from "../db/database.ts";
import { ticketUpdates, tickets, type TicketRow } from "../db/schema.ts";

/** Numeração inicial de chamados novos, acima dos números dos dados de exemplo. */
const FIRST_SEQUENCE: Record<TicketType, number> = { incident: 20500, request: 10500 };

export type TicketFilter = "open" | "all";

type TicketServiceDependencies = {
  db: Database;
  clock: Clock;
};

/**
 * Casos de uso do serviço de chamados. Toda operação recebe o dono do chamado (RN09):
 * a consulta filtra por ele, e o chamado de outra pessoa simplesmente "não existe".
 */
export function createTicketService({ db, clock }: TicketServiceDependencies) {
  async function findOwned(ownerId: string, number: string): Promise<TicketRow> {
    const row = await db.query.tickets.findFirst({
      where: and(eq(tickets.number, number), eq(tickets.ownerId, ownerId)),
    });
    if (!row) {
      throw new AppError("NOT_FOUND", `Chamado ${number} não encontrado.`);
    }
    return row;
  }

  async function toDto(row: TicketRow): Promise<TicketDto> {
    const updates = await db.query.ticketUpdates.findMany({
      where: eq(ticketUpdates.ticketId, row.id),
      orderBy: asc(ticketUpdates.createdAt),
    });
    return {
      number: row.number,
      ownerId: row.ownerId,
      type: row.type,
      category: row.category,
      priority: row.priority,
      status: row.status,
      affected: row.affected,
      title: row.title,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastStaffUpdateAt: row.lastStaffUpdateAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      updates: updates.map((update) => ({
        author: update.author,
        message: update.message,
        createdAt: update.createdAt.toISOString(),
      })),
    };
  }

  async function nextSequence(type: TicketType): Promise<number> {
    const [result] = await db
      .select({ highest: max(tickets.sequence) })
      .from(tickets)
      .where(eq(tickets.type, type));
    return Math.max((result?.highest ?? 0) + 1, FIRST_SEQUENCE[type]);
  }

  async function recordUpdate(ticketId: number, author: UpdateAuthor, message: string) {
    await db.insert(ticketUpdates).values({ ticketId, author, message, createdAt: clock.now() });
  }

  return {
    async list(ownerId: string, filter: TicketFilter): Promise<TicketDto[]> {
      const rows = await db.query.tickets.findMany({
        where:
          filter === "open"
            ? and(eq(tickets.ownerId, ownerId), inArray(tickets.status, [...OPEN_TICKET_STATUSES]))
            : eq(tickets.ownerId, ownerId),
        orderBy: desc(tickets.updatedAt),
      });
      return Promise.all(rows.map(toDto));
    },

    async get(ownerId: string, number: string): Promise<TicketDto> {
      return toDto(await findOwned(ownerId, number));
    },

    async create(ownerId: string, draft: TicketDraft): Promise<TicketDto> {
      const now = clock.now();
      const sequence = await nextSequence(draft.type);
      const [row] = await db
        .insert(tickets)
        .values({
          number: formatTicketNumber(draft.type, sequence),
          sequence,
          ownerId,
          ...draft,
          status: "new",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new AppError("INTERNAL", "Falha ao criar o chamado.");

      await recordUpdate(row.id, "system", "Chamado aberto pelo Nexo Assist.");
      return toDto(row);
    },

    /** Complemento de um chamado aberto (RN05). Atualização da equipe de TI reinicia o prazo (A17). */
    async addUpdate(
      ownerId: string,
      number: string,
      author: UpdateAuthor,
      message: string,
    ): Promise<TicketDto> {
      const row = await findOwned(ownerId, number);
      if (!isOpenStatus(row.status)) {
        throw new AppError(
          "CONFLICT",
          `O chamado ${number} está ${TICKET_STATUS_LABELS[row.status].toLowerCase()}; reabra-o ou abra um novo.`,
        );
      }

      const now = clock.now();
      await recordUpdate(row.id, author, message);
      const [updated] = await db
        .update(tickets)
        .set({ updatedAt: now, ...(author === "staff" ? { lastStaffUpdateAt: now } : {}) })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated ?? row);
    },

    /** RN06: reabre chamado resolvido há até 7 dias. */
    async reopen(ownerId: string, number: string): Promise<TicketDto> {
      const row = await findOwned(ownerId, number);
      const now = clock.now();
      const check = checkReopen(
        { status: row.status, ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}) },
        now,
      );
      if (!check.canReopen) {
        throw new AppError(
          "CONFLICT",
          check.reason === "not_resolved"
            ? `O chamado ${number} não está resolvido.`
            : `O chamado ${number} foi resolvido há mais de 7 dias; abra um chamado novo.`,
        );
      }

      await recordUpdate(row.id, "system", "Chamado reaberto pelo funcionário.");
      const [updated] = await db
        .update(tickets)
        .set({ status: "reopened", resolvedAt: null, updatedAt: now })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated ?? row);
    },

    /**
     * R31: um analista assumiu a conversa do chamado. O chamado fica "em atendimento", e o
     * registro é da equipe de TI: conta como resposta para o prazo (A17).
     */
    async assume(ownerId: string, number: string, analystName: string): Promise<TicketDto> {
      const row = await findOwned(ownerId, number);
      if (!isOpenStatus(row.status)) {
        throw new AppError("CONFLICT", `O chamado ${number} não está aberto.`);
      }
      const now = clock.now();
      await recordUpdate(row.id, "staff", `Atendimento assumido por ${analystName}.`);
      const [updated] = await db
        .update(tickets)
        .set({ status: "in_service", updatedAt: now, lastStaffUpdateAt: now })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated ?? row);
    },

    /**
     * O analista devolveu a conversa ao assistente (11.3): ninguém da TI está a caminho pelo
     * chat, então o chamado sai de "aguardando analista" ou "em atendimento" e volta a "em
     * andamento", com o registro de quem devolveu. Outros status ficam como estão.
     */
    async release(ownerId: string, number: string, analystName: string): Promise<TicketDto> {
      const row = await findOwned(ownerId, number);
      if (row.status !== "waiting_analyst" && row.status !== "in_service") return toDto(row);
      await recordUpdate(row.id, "system", `Conversa devolvida ao assistente por ${analystName}.`);
      const [updated] = await db
        .update(tickets)
        .set({ status: "in_progress", updatedAt: clock.now() })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated ?? row);
    },

    /** RN07: marca o chamado como aguardando analista e registra o resumo do caso. */
    async transfer(ownerId: string, number: string, summary: string): Promise<TicketDto> {
      const row = await findOwned(ownerId, number);
      if (!isOpenStatus(row.status)) {
        throw new AppError("CONFLICT", `O chamado ${number} não está aberto.`);
      }

      const now = clock.now();
      await recordUpdate(row.id, "system", `Transferido para um analista. Resumo: ${summary}`);
      const [updated] = await db
        .update(tickets)
        .set({ status: "waiting_analyst", updatedAt: now })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated ?? row);
    },
  };
}

export type TicketService = ReturnType<typeof createTicketService>;
