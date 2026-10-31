import { HANDOFF_REASON_LABELS, type Clock } from "@nexo/shared/domain";
import { AppError } from "@nexo/shared/errors";
import type { UIMessage } from "ai";
import { toTicketSummary } from "../agent/ticket-view.ts";
import type { ConsoleConversationSummary, ConversationStore } from "../db/conversation-store.ts";
import type { DecisionStore } from "../db/decision-store.ts";
import type { DraftStore } from "../db/draft-store.ts";
import type { HandoffStore } from "../db/handoff-store.ts";
import type { HandoffRow, UserRow } from "../db/schema.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { textOf } from "./chat-text.ts";
import type { AnalystView, ConversationReader } from "./conversation-reader.ts";

/** Filtros da lista do console (tela 4), com a contagem de cada um. */
export const CONSOLE_FILTERS = ["all", "for_you", "with_agent", "mine"] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];

/** A20: online é quem carregou a conversa no último minuto (o chat consulta a cada 3 s). */
const ONLINE_WINDOW_MS = 60_000;
/** A prévia da última mensagem na lista. */
const PREVIEW_MAX_CHARS = 80;

/**
 * O que a etiqueta da conversa diz (tela 4). A tela monta o texto; o "contato em N min" é
 * recalculado nela a cada minuto (R36).
 */
export type ConsoleConversationState =
  | {
      kind: "waiting";
      reason: string;
      ticketNumber: string | null;
      responseDueAt: string;
      /** Só na transferência por confiança baixa (R39): "Agent pediu ajuda · confiança 41%". */
      confidence: number | null;
    }
  | { kind: "analyst"; byMe: boolean; analyst: AnalystView | null }
  | { kind: "agent" };

export type ConsoleListItem = {
  id: string;
  employee: { name: string; department: string; isOnline: boolean };
  state: ConsoleConversationState;
  updatedAt: string;
  lastMessage: {
    author: string;
    text: string;
    createdAt: string;
    seenByEmployee: boolean | null;
  } | null;
  unread: number;
};

type ConsoleServiceDependencies = {
  conversationStore: ConversationStore;
  handoffStore: HandoffStore;
  decisionStore: DecisionStore;
  draftStore: DraftStore;
  ticketGateway: TicketGateway;
  conversationReader: ConversationReader;
  clock: Clock;
};

/** Comparação de busca sem acentos e sem diferença de maiúsculas ("fabio" acha "Fábio"). */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesFilter(item: ConsoleListItem, filter: ConsoleFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "for_you":
      return item.state.kind === "waiting";
    case "with_agent":
      return item.state.kind === "agent";
    case "mine":
      return item.state.kind === "analyst" && item.state.byMe;
  }
}

/**
 * Console do analista, só leitura (tela 4): a lista com filtros e busca, a conversa com os
 * registros de decisão (R28) e os chamados do funcionário (RF21). Assumir, responder, devolver e
 * encerrar são da T24.
 */
export function createConsoleService({
  conversationStore,
  handoffStore,
  decisionStore,
  draftStore,
  ticketGateway,
  conversationReader,
  clock,
}: ConsoleServiceDependencies) {
  const isOnline = (lastSeenAt: Date | null) =>
    lastSeenAt !== null && clock.now().getTime() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS;

  async function stateOf(
    conversation: Pick<ConsoleConversationSummary, "id" | "mode" | "assignedAnalystId">,
    analyst: UserRow,
    analysts: Map<string, AnalystView>,
    handoff: HandoffRow | undefined,
  ): Promise<ConsoleConversationState> {
    if (conversation.mode === "waiting_analyst" && handoff) {
      const confidence =
        handoff.reason === "low_confidence"
          ? ((await decisionStore.latestForConversation(conversation.id))?.classifierConfidence ??
            null)
          : null;
      return {
        kind: "waiting",
        reason: HANDOFF_REASON_LABELS[handoff.reason],
        ticketNumber: handoff.ticketNumber,
        responseDueAt: handoff.responseDueAt.toISOString(),
        confidence,
      };
    }
    if (conversation.mode === "analyst") {
      const assigned = conversation.assignedAnalystId;
      return {
        kind: "analyst",
        byMe: assigned === analyst.id,
        analyst: assigned ? (analysts.get(assigned) ?? null) : null,
      };
    }
    return { kind: "agent" };
  }

  /** Os números de chamado ligados à conversa: o da transferência e os criados nela. */
  async function linkedTicketNumbers(conversationId: string, handoff: HandoffRow | undefined) {
    const drafts = await draftStore.listByConversation(conversationId);
    const fromDrafts = drafts.flatMap((draft) =>
      draft.status === "confirmed" && draft.ticketNumber ? [draft.ticketNumber] : [],
    );
    return new Set([...(handoff?.ticketNumber ? [handoff.ticketNumber] : []), ...fromDrafts]);
  }

  async function toListItem(
    conversation: ConsoleConversationSummary,
    analyst: UserRow,
    analysts: Map<string, AnalystView>,
  ): Promise<{ item: ConsoleListItem; searchable: string }> {
    const handoff = await handoffStore.latestForConversation(conversation.id);
    const [last] = await conversationStore.listRecentMessages(conversation.id, 1);
    const lastText = last ? textOf(JSON.parse(last.parts) as UIMessage["parts"]) : "";
    const tickets = await linkedTicketNumbers(conversation.id, handoff);
    const seenAt = conversation.employee.lastSeenAt;
    const item: ConsoleListItem = {
      id: conversation.id,
      employee: {
        name: conversation.employee.name,
        department: conversation.employee.department,
        isOnline: isOnline(seenAt),
      },
      state: await stateOf(conversation, analyst, analysts, handoff),
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessage: last
        ? {
            author: last.author,
            text: lastText.slice(0, PREVIEW_MAX_CHARS),
            createdAt: last.createdAt.toISOString(),
            seenByEmployee:
              last.author === "employee" ? null : seenAt !== null && seenAt >= last.createdAt,
          }
        : null,
      unread: await conversationStore.countEmployeeMessagesSince(
        conversation.id,
        conversation.analystReadAt,
      ),
    };
    const searchable = fold(
      [conversation.employee.name, conversation.employee.department, ...tickets].join(" "),
    );
    return { item, searchable };
  }

  async function findConversation(conversationId: string) {
    const conversation = (await conversationStore.listOpenForConsole()).find(
      (candidate) => candidate.id === conversationId,
    );
    if (!conversation) throw new AppError("NOT_FOUND", "Conversa não encontrada.");
    return conversation;
  }

  return {
    /** RF18: a lista, a contagem de cada filtro e a busca por nome, setor ou chamado. */
    async list(analyst: UserRow, options: { filter: ConsoleFilter; query: string }) {
      const analysts = await conversationReader.analysts();
      const rows = await Promise.all(
        (await conversationStore.listOpenForConsole()).map((conversation) =>
          toListItem(conversation, analyst, analysts),
        ),
      );
      const query = fold(options.query.trim());
      const found = query ? rows.filter((row) => row.searchable.includes(query)) : rows;
      const items = found.map((row) => row.item);
      const counts = Object.fromEntries(
        CONSOLE_FILTERS.map((filter) => [
          filter,
          items.filter((item) => matchesFilter(item, filter)).length,
        ]),
      ) as Record<ConsoleFilter, number>;
      return {
        counts,
        conversations: items.filter((item) => matchesFilter(item, options.filter)),
      };
    },

    /**
     * RF19: a conversa com o histórico, o motivo e o resumo da transferência e o registro de
     * decisão de cada resposta (R28). Abrir marca as mensagens do funcionário como lidas.
     */
    async detail(analyst: UserRow, conversationId: string) {
      const conversation = await findConversation(conversationId);
      const analysts = await conversationReader.analysts();
      const handoff = await handoffStore.latestForConversation(conversation.id);
      const messages = await conversationReader.messages(conversation.id, analysts, {
        employeeSeenAt: conversation.employee.lastSeenAt,
      });
      await conversationStore.markReadByAnalyst(conversation.id, clock.now());
      return {
        conversation: {
          id: conversation.id,
          mode: conversation.mode,
          version: conversation.version,
          employee: {
            name: conversation.employee.name,
            department: conversation.employee.department,
            isOnline: isOnline(conversation.employee.lastSeenAt),
          },
          state: await stateOf(conversation, analyst, analysts, handoff),
          handoff: handoff
            ? {
                reason: HANDOFF_REASON_LABELS[handoff.reason],
                supportLevel: handoff.supportLevel,
                problem: handoff.problem,
                attempted: handoff.attempted,
                ticketNumber: handoff.ticketNumber,
                responseDueAt: handoff.responseDueAt.toISOString(),
              }
            : null,
        },
        messages,
      };
    },

    /**
     * RF21: os chamados do funcionário da conversa, os desta conversa primeiro. O analista é a
     * exceção da RN09 (A15): o acesso fica registrado no log.
     */
    async tickets(analyst: UserRow, conversationId: string) {
      const conversation = await findConversation(conversationId);
      const handoff = await handoffStore.latestForConversation(conversation.id);
      const linked = await linkedTicketNumbers(conversation.id, handoff);
      console.info(
        `[A15] ${analyst.id} consultou os chamados de ${conversation.employee.id} (conversa ${conversation.id})`,
      );
      const now = clock.now();
      const tickets = (await ticketGateway.listTickets(conversation.employee.id, "all")).map(
        (ticket) => toTicketSummary(ticket, now),
      );
      return {
        employeeName: conversation.employee.name,
        openCount: tickets.filter((ticket) => ticket.isOpen).length,
        closedCount: tickets.filter((ticket) => !ticket.isOpen).length,
        thisConversation: tickets.filter((ticket) => linked.has(ticket.number)),
        others: tickets.filter((ticket) => !linked.has(ticket.number)),
      };
    },
  };
}

export type ConsoleService = ReturnType<typeof createConsoleService>;
