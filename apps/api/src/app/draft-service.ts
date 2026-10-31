import type { TicketDto } from "@nexo/shared/contracts";
import {
  AFFECTED_SCOPE_LABELS,
  DRAFT_FIELD_LABELS,
  SLA_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  checkReopen,
  classifyPriority,
  computeDeadline,
  findDuplicateCandidates,
  formatBrasiliaDateTime,
  isOpenStatus,
  parseTicketNumber,
  type Clock,
  type DraftField,
} from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { z } from "zod";
import {
  newTicketInputSchema,
  type Draft,
  type DraftStore,
  type NewTicketContent,
} from "../db/draft-store.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";

type DraftServiceDependencies = {
  draftStore: DraftStore;
  ticketGateway: TicketGateway;
  clock: Clock;
};

/** Campos que o agent extrai da conversa. A prioridade não está aqui: ela sai da matriz (RN11). */
export type NewTicketInput = Partial<Record<keyof z.infer<typeof newTicketInputSchema>, unknown>>;

const URGENCY_FIELD_LABEL = "urgência (se há trabalho parado, compromisso hoje ou alternativa)";

/**
 * Rascunhos de chamado (RN04): o agent propõe, o funcionário confere, e só a confirmação cria ou
 * atualiza. Tools do agent e botões da tela usam este mesmo caso de uso.
 */
export function createDraftService({ draftStore, ticketGateway, clock }: DraftServiceDependencies) {
  /** O rascunho do funcionário; de outra pessoa ou inexistente responde igual (RN09). */
  async function ownDraft(employeeId: string, draftNumber: number): Promise<Draft> {
    const draft = await draftStore.find(draftNumber);
    if (!draft || draft.employeeId !== employeeId) {
      throw new AppError("NOT_FOUND", `Rascunho D-${draftNumber} não encontrado.`);
    }
    return draft;
  }

  function requirePending(draft: Draft) {
    if (draft.status !== "pending") {
      const what = draft.status === "confirmed" ? "já foi confirmado" : "foi cancelado";
      throw new AppError("CONFLICT", `O rascunho D-${draft.number} ${what}.`);
    }
  }

  /** Executa no sistema de chamados com a chave do rascunho: confirmar de novo não duplica (R01). */
  async function execute(draft: Draft, employeeId: string): Promise<TicketDto> {
    const key = draft.idempotencyKey;
    if (draft.kind === "create") {
      // A urgência só serviu para calcular a prioridade; o sistema de chamados recebe os campos da RN03.
      const { title, description, type, category, priority, affected } = draft.content;
      return ticketGateway.createTicket(
        employeeId,
        { title, description, type, category, priority, affected },
        key,
      );
    }
    const number = draft.ticketNumber ?? "";
    if (draft.kind === "reopen") {
      await ticketGateway.reopenTicket(employeeId, number, `${key}:reopen`);
    }
    return ticketGateway.addUpdate(
      employeeId,
      number,
      { author: "employee", message: draft.content.message },
      `${key}:update`,
    );
  }

  return {
    /**
     * RF15: propõe um chamado novo. Diz o que falta (RN03), aponta possíveis duplicados (RN05)
     * e só então grava o rascunho pendente, descartando o anterior da conversa.
     */
    async proposeNewTicket(request: {
      employeeId: string;
      conversationId: string;
      input: NewTicketInput;
      duplicatesReviewed: boolean;
    }) {
      const content = newTicketInputSchema.safeParse(request.input);
      if (!content.success) {
        return {
          ok: false as const,
          reason: "incomplete" as const,
          missing: missingFields(request.input),
        };
      }

      const now = clock.now();
      if (!request.duplicatesReviewed) {
        const candidates = await duplicateCandidates(request.employeeId, content.data, now);
        if (candidates.length > 0) {
          return { ok: false as const, reason: "possible_duplicate" as const, candidates };
        }
      }

      const { priority, reason } = classifyPriority(content.data.affected, content.data.urgency);
      await draftStore.cancelPendingInConversation(request.conversationId, now);
      const draft = await draftStore.create({
        kind: "create",
        conversationId: request.conversationId,
        employeeId: request.employeeId,
        content: { ...content.data, priority },
        priorityReason: reason,
        now,
      });
      return { ok: true as const, draft: toDraftView(draft, now) };
    },

    /** RF14: complementa um chamado aberto (RN05) ou reabre um resolvido há até 7 dias (RN06). */
    async proposeTicketUpdate(request: {
      employeeId: string;
      conversationId: string;
      ticketNumber: string;
      message: string;
    }) {
      const number = parseTicketNumber(request.ticketNumber);
      if (!number) return { ok: false as const, reason: "invalid_number" as const };

      const ticket = await ticketGateway.getTicket(request.employeeId, number);
      const now = clock.now();
      const kind = isOpenStatus(ticket.status) ? "update" : reopenKind(ticket, now);
      if (!kind) return { ok: false as const, reason: "cannot_reopen" as const };

      await draftStore.cancelPendingInConversation(request.conversationId, now);
      const draft = await draftStore.create({
        kind,
        conversationId: request.conversationId,
        employeeId: request.employeeId,
        ticketNumber: number,
        content: { message: request.message },
        now,
      });
      return { ok: true as const, draft: toDraftView(draft, now) };
    },

    /**
     * RN04: cria ou atualiza o chamado só com a confirmação do funcionário.
     * Pelo chat (R04), `shownBefore` é o início do turno: o rascunho precisa existir, sem mudanças,
     * desde antes da mensagem que confirmou. Assim o agent nunca propõe e confirma no mesmo turno.
     */
    async confirm(request: {
      employeeId: string;
      draftNumber: number;
      conversationId?: string;
      shownBefore?: Date;
    }) {
      const draft = await ownDraft(request.employeeId, request.draftNumber);
      if (request.conversationId && draft.conversationId !== request.conversationId) {
        throw new AppError("NOT_FOUND", `Rascunho D-${draft.number} não encontrado.`);
      }
      requirePending(draft);
      if (request.shownBefore && draft.updatedAt.getTime() >= request.shownBefore.getTime()) {
        throw new AppError(
          "CONFLICT",
          `O funcionário ainda não viu o rascunho D-${draft.number}: mostre-o e espere a confirmação.`,
        );
      }

      const ticket = await execute(draft, request.employeeId);
      const confirmed = await draftStore.setStatus(
        draft.number,
        "confirmed",
        clock.now(),
        ticket.number,
      );
      return { draft: toDraftView(confirmed, clock.now()), ticket };
    },

    async cancel(request: { employeeId: string; draftNumber: number }) {
      const draft = await ownDraft(request.employeeId, request.draftNumber);
      requirePending(draft);
      const cancelled = await draftStore.setStatus(draft.number, "cancelled", clock.now());
      return toDraftView(cancelled, clock.now());
    },

    /** R16: o funcionário corrige os campos no card; a prioridade é recalculada pela matriz. */
    async edit(request: { employeeId: string; draftNumber: number; changes: NewTicketInput }) {
      const draft = await ownDraft(request.employeeId, request.draftNumber);
      requirePending(draft);
      if (draft.kind !== "create") {
        throw new AppError("INVALID_REQUEST", "Só rascunhos de chamado novo podem ser editados.");
      }

      // A prioridade gravada fica de fora (o schema a descarta) e é recalculada abaixo.
      const content = newTicketInputSchema.safeParse({ ...draft.content, ...request.changes });
      if (!content.success) {
        throw new AppError("INVALID_REQUEST", "Rascunho incompleto ou inválido.");
      }
      const { priority, reason } = classifyPriority(content.data.affected, content.data.urgency);
      const edited = await draftStore.updateContent(
        draft.number,
        { ...content.data, priority },
        reason,
        clock.now(),
      );
      return toDraftView(edited, clock.now());
    },

    async view(request: { employeeId: string; draftNumber: number }) {
      return toDraftView(await ownDraft(request.employeeId, request.draftNumber), clock.now());
    },
  };

  async function duplicateCandidates(
    employeeId: string,
    content: Pick<NewTicketContent, "title" | "description" | "category">,
    now: Date,
  ) {
    const ownTickets = await ticketGateway.listTickets(employeeId, "all");
    const candidates = findDuplicateCandidates(
      ownTickets.map((ticket) => ({
        ...ticket,
        ...(ticket.resolvedAt
          ? { resolvedAt: new Date(ticket.resolvedAt) }
          : { resolvedAt: undefined }),
      })),
      { description: `${content.title} ${content.description}`, category: content.category },
      now,
    );
    return candidates.map(({ ticket, action }) => ({
      number: ticket.number,
      title: ticket.title,
      status: TICKET_STATUS_LABELS[ticket.status],
      action: action === "update" ? "complementar" : "reabrir",
    }));
  }
}

export type DraftService = ReturnType<typeof createDraftService>;

function reopenKind(ticket: TicketDto, now: Date): "reopen" | undefined {
  const resolvedAt = ticket.resolvedAt ? new Date(ticket.resolvedAt) : undefined;
  return checkReopen({ status: ticket.status, ...(resolvedAt ? { resolvedAt } : {}) }, now)
    .canReopen
    ? "reopen"
    : undefined;
}

/** O que falta para propor o chamado, com os nomes que o agent usa para perguntar (RN03). */
function missingFields(input: NewTicketInput): string[] {
  const missing = (Object.keys(DRAFT_FIELD_LABELS) as DraftField[])
    .filter((field) => field !== "priority")
    .filter((field) => !newTicketInputSchema.shape[field].safeParse(input[field]).success)
    .map((field) => DRAFT_FIELD_LABELS[field]);
  const urgencyOk = newTicketInputSchema.shape.urgency.safeParse(input.urgency).success;
  return urgencyOk ? missing : [...missing, URGENCY_FIELD_LABEL];
}

/**
 * Rascunho como o agent e o card da tela mostram. O prazo da primeira resposta é calculado na hora
 * da exibição: se a confirmação vier depois, o valor mostrado acompanha (R35).
 */
export function toDraftView(draft: Draft, now: Date) {
  const base = {
    draftId: `D-${draft.number}`,
    number: draft.number,
    kind: draft.kind,
    status: draft.status,
    ticketNumber: draft.ticketNumber,
  };
  if (draft.kind !== "create") {
    return { ...base, update: { message: draft.content.message } };
  }

  const { title, description, type, category, affected, priority } = draft.content;
  return {
    ...base,
    ticket: {
      title,
      description,
      type: TICKET_TYPE_LABELS[type],
      category: TICKET_CATEGORY_LABELS[category],
      affected: AFFECTED_SCOPE_LABELS[affected],
      priority: TICKET_PRIORITY_LABELS[priority],
      priorityReason: draft.priorityReason,
      slaRule: SLA_LABELS[priority],
      firstResponseBy: formatBrasiliaDateTime(computeDeadline(priority, now)),
    },
  };
}

export type DraftView = ReturnType<typeof toDraftView>;
