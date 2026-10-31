import { TICKET_STATUSES } from "@nexo/shared/domain";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { z } from "zod";

/**
 * Chamados que as tools devolveram (tela 3), lidos das partes da mensagem, sem React. A api manda
 * o resumo já em português e com o prazo calculado (ticket-view.ts); aqui só se confere a forma.
 */

const ticketSummarySchema = z.object({
  number: z.string(),
  title: z.string(),
  category: z.string(),
  priority: z.string(),
  status: z.string(),
  statusCode: z.enum(TICKET_STATUSES),
  isOpen: z.boolean(),
  openedAt: z.string(),
  openedOn: z.string(),
  lastTeamUpdateAt: z.string().nullable(),
  timeWithoutTeamResponse: z.string(),
  deadline: z.object({ rule: z.string(), dueAt: z.string(), isOverdue: z.boolean() }).nullable(),
});
export type TicketSummaryView = z.infer<typeof ticketSummarySchema>;

const ticketDetailsSchema = ticketSummarySchema.extend({ description: z.string() });
export type TicketDetailsView = z.infer<typeof ticketDetailsSchema>;

const listOutputSchema = z.object({ ok: z.literal(true), tickets: z.array(ticketSummarySchema) });
const getOutputSchema = z.object({ ok: z.literal(true), ticket: ticketDetailsSchema });

/** Saída já concluída da última chamada da tool, pelo nome. */
function lastOutput(message: UIMessage, toolName: string): unknown {
  const part = message.parts
    .filter(isToolUIPart)
    .findLast((candidate) => getToolName(candidate) === toolName);
  return part?.state === "output-available" ? part.output : undefined;
}

/** RF08: os chamados que o agent listou, para o funcionário escolher um. */
export function listedTicketsOf(message: UIMessage): TicketSummaryView[] | undefined {
  const parsed = listOutputSchema.safeParse(lastOutput(message, "list_my_tickets"));
  return parsed.success && parsed.data.tickets.length > 0 ? parsed.data.tickets : undefined;
}

/** RF09: o chamado consultado (pelo agent ou pela escolha na lista). */
export function consultedTicketOf(message: UIMessage): TicketDetailsView | undefined {
  const parsed = getOutputSchema.safeParse(lastOutput(message, "get_ticket"));
  return parsed.success ? parsed.data.ticket : undefined;
}

/** RN07, A04: aberto e com o prazo vencido, o assistente oferece um analista. */
export function isOverdueAndOpen(ticket: TicketSummaryView): boolean {
  return ticket.isOpen && ticket.deadline?.isOverdue === true;
}
