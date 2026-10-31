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
  ticketUpdateContentSchema,
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

/** Qual rascunho, de quem e de qual conversa. Toda ação vem de uma conversa. */
type DraftRef = { employeeId: string; draftNumber: number; conversationId: string };

/**
 * De onde veio a confirmação. Pelo botão, o funcionário clicou no card que está vendo. Pelo chat
 * (R04), o rascunho precisa ter sido visto antes da mensagem que confirmou (o início do turno).
 */
export type ConfirmationSource = { via: "button" } | { via: "chat"; turnStartedAt: Date };

const URGENCY_FIELD_LABEL = "urgência (se há trabalho parado, compromisso hoje ou alternativa)";
const UPDATE_MESSAGE_LABEL = "o complemento (o que há de novo no problema)";

/**
 * Uma confirmação em andamento há mais que isso ficou abandonada (o processo caiu no meio):
 * pode ser retomada. É bem mais que as tentativas da api ao sistema de chamados.
 */
const STALE_CONFIRMATION_MS = 60 * 1000;

/** Ids de rascunho escritos numa resposta do agent ("D-12"). */
const DRAFT_ID_IN_TEXT = /\bD-(\d{1,9})\b/g;

/**
 * Rascunhos de chamado (RN04): o agent propõe, o funcionário confere, e só a confirmação cria ou
 * atualiza. Tools do agent e botões da tela usam este mesmo caso de uso.
 */
export function createDraftService({ draftStore, ticketGateway, clock }: DraftServiceDependencies) {
  /** O rascunho do funcionário nesta conversa. De outra pessoa, outra conversa ou inexistente responde igual (RN09). */
  async function ownDraft({ employeeId, draftNumber, conversationId }: DraftRef): Promise<Draft> {
    const draft = await draftStore.find(draftNumber);
    if (!draft || draft.employeeId !== employeeId || draft.conversationId !== conversationId) {
      throw new AppError("NOT_FOUND", `Rascunho D-${draftNumber} não encontrado.`);
    }
    return draft;
  }

  /** Por que o rascunho não aceita a ação, conforme o status em que está. */
  function notAvailable(draft: Draft): AppError {
    const id = `D-${draft.number}`;
    const reasons: Record<Draft["status"], string> = {
      pending: `O rascunho ${id} mudou enquanto a ação acontecia; confira e tente de novo.`,
      confirming: `A confirmação do rascunho ${id} já está em andamento.`,
      confirm_failed: `A confirmação do rascunho ${id} já foi tentada e não se concluiu; ele só pode ser confirmado de novo.`,
      confirmed: `O rascunho ${id} já foi confirmado.`,
      cancelled: `O rascunho ${id} foi cancelado.`,
    };
    return new AppError("CONFLICT", reasons[draft.status]);
  }

  function requirePending(draft: Draft) {
    if (draft.status !== "pending") throw notAvailable(draft);
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
    if (draft.kind === "reopen") {
      await ticketGateway.reopenTicket(employeeId, draft.ticketNumber, `${key}:reopen`);
    }
    return ticketGateway.addUpdate(
      employeeId,
      draft.ticketNumber,
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
      const content = ticketUpdateContentSchema.safeParse({ message: request.message });
      if (!content.success) {
        return {
          ok: false as const,
          reason: "incomplete" as const,
          missing: [UPDATE_MESSAGE_LABEL],
        };
      }
      const number = parseTicketNumber(request.ticketNumber);
      if (!number) return { ok: false as const, reason: "invalid_number" as const };

      const ticket = await ticketGateway.getTicket(request.employeeId, number);
      const now = clock.now();
      const target = updateTarget(ticket, now);
      if (!target.ok) return target;

      await draftStore.cancelPendingInConversation(request.conversationId, now);
      const draft = await draftStore.create({
        kind: target.kind,
        conversationId: request.conversationId,
        employeeId: request.employeeId,
        ticketNumber: number,
        content: content.data,
        now,
      });
      return { ok: true as const, draft: toDraftView(draft, now) };
    },

    /**
     * R04: o agent terminou uma resposta que mostra estes rascunhos ("D-12"). Só a partir daqui
     * o funcionário pode confirmá-los pelo chat; se o turno falhou antes, o rascunho não foi visto.
     */
    async markShownInReply(conversationId: string, replyText: string) {
      const numbers = [...replyText.matchAll(DRAFT_ID_IN_TEXT)].map((match) => Number(match[1]));
      await draftStore.markShown(conversationId, numbers, clock.now());
    },

    /**
     * RN04: cria ou atualiza o chamado só com a confirmação do funcionário.
     * O rascunho é reservado de forma atômica antes da escrita: duas confirmações ao mesmo tempo
     * não executam as duas (R01). Se a escrita falha, ele fica congelado em `confirm_failed`,
     * porque o chamado pode ter sido criado: só vale confirmar de novo, com a mesma chave.
     */
    async confirm(request: DraftRef & { source: ConfirmationSource }) {
      const draft = await ownDraft(request);
      if (draft.status !== "pending" && draft.status !== "confirm_failed") {
        throw notAvailable(draft);
      }
      if (request.source.via === "chat" && !wasShownBefore(draft, request.source.turnStartedAt)) {
        throw new AppError(
          "CONFLICT",
          `O funcionário ainda não viu o rascunho D-${draft.number}: mostre-o e espere a confirmação.`,
        );
      }

      const now = clock.now();
      const claimed = await draftStore.claimForConfirmation(
        draft.number,
        now,
        new Date(now.getTime() - STALE_CONFIRMATION_MS),
      );
      if (!claimed) throw notAvailable((await draftStore.find(draft.number)) ?? draft);

      let ticket: TicketDto;
      try {
        ticket = await execute(claimed, request.employeeId);
      } catch (error) {
        await draftStore.failConfirmation(claimed.number, clock.now());
        throw error;
      }
      const confirmed = await draftStore.finishConfirmation(
        claimed.number,
        ticket.number,
        clock.now(),
      );
      if (!confirmed) throw new Error(`Rascunho D-${claimed.number} mudou durante a confirmação`);
      return { draft: toDraftView(confirmed, clock.now()), ticket };
    },

    async cancel(request: DraftRef) {
      const draft = await ownDraft(request);
      requirePending(draft);
      const cancelled = await draftStore.cancel(draft.number, clock.now());
      if (!cancelled) throw notAvailable((await draftStore.find(draft.number)) ?? draft);
      return toDraftView(cancelled, clock.now());
    },

    /** R16: o funcionário corrige os campos no card; a prioridade é recalculada pela matriz. */
    async edit(request: DraftRef & { changes: NewTicketInput }) {
      const draft = await ownDraft(request);
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
      if (!edited) throw notAvailable((await draftStore.find(draft.number)) ?? draft);
      return toDraftView(edited, clock.now());
    },

    /**
     * R03: o que está pendente na conversa, para o agent saber mesmo numa sessão nova, em que as
     * mensagens que mostraram o rascunho já não estão no histórico dele.
     */
    async describePending(conversationId: string): Promise<string | null> {
      const pending = await draftStore.listPending(conversationId);
      if (pending.length === 0) return null;
      return pending
        .map((draft) => {
          const what =
            draft.kind === "create"
              ? `chamado novo "${draft.content.title}"`
              : `complemento ao chamado ${draft.ticketNumber}`;
          const shown = draft.shownAt ? "já mostrado ao funcionário" : "ainda não mostrado";
          return `D-${draft.number}: ${what} (${shown})`;
        })
        .join("; ");
    },

    /** O rascunho como o card mostra (o card visual chega na T19). */
    async view(request: DraftRef) {
      return toDraftView(await ownDraft(request), clock.now());
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

/** R04: visto (mostrado numa resposta concluída ou editado no card) antes de o turno começar. */
function wasShownBefore(draft: Draft, turnStartedAt: Date): boolean {
  return draft.shownAt !== null && draft.shownAt.getTime() < turnStartedAt.getTime();
}

/**
 * Chamado aberto recebe complemento; resolvido há até 7 dias é reaberto (RN06). Os outros casos
 * dizem o motivo, para o agent não explicar um chamado cancelado como "passou de 7 dias".
 */
function updateTarget(ticket: TicketDto, now: Date) {
  if (isOpenStatus(ticket.status)) return { ok: true as const, kind: "update" as const };
  const resolvedAt = ticket.resolvedAt ? new Date(ticket.resolvedAt) : undefined;
  const check = checkReopen({ status: ticket.status, ...(resolvedAt ? { resolvedAt } : {}) }, now);
  if (check.canReopen) return { ok: true as const, kind: "reopen" as const };
  return {
    ok: false as const,
    reason: "cannot_reopen" as const,
    why: check.reason === "window_expired" ? ("window_expired" as const) : ("cancelled" as const),
  };
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
 * Rascunho como o agent e o card da tela mostram. Enquanto não confirmado, o prazo da primeira
 * resposta é calculado na hora da exibição: se a confirmação vier depois, o valor acompanha (R35).
 * Depois de confirmado, fica o prazo da hora da confirmação, quando o chamado passou a existir.
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
  const deadlineFrom = draft.status === "confirmed" ? draft.updatedAt : now;
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
      firstResponseBy: formatBrasiliaDateTime(computeDeadline(priority, deadlineFrom)),
    },
  };
}

export type DraftView = ReturnType<typeof toDraftView>;
