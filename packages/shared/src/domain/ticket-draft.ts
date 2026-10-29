import { z } from "zod";
import { AFFECTED_SCOPES, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_TYPES } from "./ticket.ts";

/** Limites de texto: o bastante para o analista não precisar perguntar tudo de novo, sem textos enormes. */
export const TICKET_TITLE_MIN_CHARS = 5;
export const TICKET_TITLE_MAX_CHARS = 120;
export const TICKET_DESCRIPTION_MIN_CHARS = 10;
export const TICKET_DESCRIPTION_MAX_CHARS = 2000;

/** RN03: todo chamado precisa de título, descrição, tipo, categoria, prioridade e de quem é afetado. */
export const ticketDraftSchema = z.object({
  title: z.string().trim().min(TICKET_TITLE_MIN_CHARS).max(TICKET_TITLE_MAX_CHARS),
  description: z
    .string()
    .trim()
    .min(TICKET_DESCRIPTION_MIN_CHARS)
    .max(TICKET_DESCRIPTION_MAX_CHARS),
  type: z.enum(TICKET_TYPES),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  affected: z.enum(AFFECTED_SCOPES),
});

export type TicketDraft = z.infer<typeof ticketDraftSchema>;
export type DraftField = keyof TicketDraft;

/** Ordem em que o agent pede o que falta: do assunto para a classificação. */
export const REQUIRED_DRAFT_FIELDS: readonly DraftField[] = [
  "title",
  "description",
  "type",
  "category",
  "affected",
  "priority",
];

/** Como cada campo aparece para o funcionário quando o agent pergunta por ele. */
export const DRAFT_FIELD_LABELS: Record<DraftField, string> = {
  title: "título",
  description: "descrição",
  type: "tipo (incidente ou requisição)",
  category: "categoria",
  affected: "quem está sendo afetado",
  priority: "prioridade",
};

export type DraftValidation =
  { isComplete: true; draft: TicketDraft } | { isComplete: false; incompleteFields: DraftField[] };

/**
 * Verifica um rascunho campo a campo e diz exatamente o que falta ou está inválido.
 * É o que permite ao agent perguntar só o necessário, e ao servidor recusar chamado incompleto.
 */
export function validateTicketDraft(input: Partial<Record<DraftField, unknown>>): DraftValidation {
  const incompleteFields = REQUIRED_DRAFT_FIELDS.filter(
    (field) => !ticketDraftSchema.shape[field].safeParse(input[field]).success,
  );

  if (incompleteFields.length > 0) {
    return { isComplete: false, incompleteFields };
  }
  return { isComplete: true, draft: ticketDraftSchema.parse(input) };
}
