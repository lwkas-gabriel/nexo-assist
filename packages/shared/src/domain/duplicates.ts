import { checkReopen, type ReopenableTicket } from "./reopen.ts";
import { countSharedTokens, tokenize } from "./text.ts";
import { isOpenStatus, type TicketCategory } from "./ticket.ts";

/** Pesos da semelhança: o título resume o problema; a categoria igual reforça. */
const TITLE_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;
const SAME_CATEGORY_BONUS = 2;
/** Abaixo disso, a semelhança é só coincidência de palavras. */
const MIN_DUPLICATE_SCORE = 3;
const MAX_DUPLICATE_CANDIDATES = 3;

export type DuplicateCheckTicket = ReopenableTicket & {
  title: string;
  description: string;
  category: TicketCategory;
};

export type ReportedIssue = {
  /** O que o funcionário contou, com as palavras dele. */
  description: string;
  category?: TicketCategory;
};

export type DuplicateCandidate<T> = {
  ticket: T;
  /** RN05: chamado aberto é atualizado. RN06: resolvido há até 7 dias é reaberto. */
  action: "update" | "reopen";
  score: number;
};

/**
 * Candidatos a "mesmo problema" entre os chamados de UM funcionário (suposição A16).
 * O código só aponta os candidatos; quem confirma que é o mesmo problema é o agent, com o funcionário.
 */
export function findDuplicateCandidates<T extends DuplicateCheckTicket>(
  ownTickets: readonly T[],
  issue: ReportedIssue,
  now: Date,
): DuplicateCandidate<T>[] {
  const issueTokens = [...new Set(tokenize(issue.description))];

  return ownTickets
    .flatMap((ticket): DuplicateCandidate<T>[] => {
      const action = applicableAction(ticket, now);
      if (!action) return [];
      return [{ ticket, action, score: similarity(ticket, issueTokens, issue.category) }];
    })
    .filter((candidate) => candidate.score >= MIN_DUPLICATE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DUPLICATE_CANDIDATES);
}

function applicableAction(
  ticket: DuplicateCheckTicket,
  now: Date,
): "update" | "reopen" | undefined {
  if (isOpenStatus(ticket.status)) return "update";
  if (checkReopen(ticket, now).canReopen) return "reopen";
  return undefined;
}

function similarity(
  ticket: DuplicateCheckTicket,
  issueTokens: readonly string[],
  category: TicketCategory | undefined,
): number {
  return (
    countSharedTokens(issueTokens, ticket.title) * TITLE_WEIGHT +
    countSharedTokens(issueTokens, ticket.description) * DESCRIPTION_WEIGHT +
    (category === ticket.category ? SAME_CATEGORY_BONUS : 0)
  );
}
