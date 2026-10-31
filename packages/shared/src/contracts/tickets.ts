import { z } from "zod";
import {
  AFFECTED_SCOPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "../domain/ticket.ts";
import { ticketDraftSchema } from "../domain/ticket-draft.ts";

/**
 * Contrato HTTP do serviço de chamados (api ↔ tickets-service).
 * O mesmo schema valida a entrada no serviço e a resposta recebida pela api.
 */

const isoDateTime = z.iso.datetime();

/** Quem escreveu uma atualização. Só a da equipe de TI conta para o prazo (A17). */
export const UPDATE_AUTHORS = ["employee", "staff", "agent", "system"] as const;
export type UpdateAuthor = (typeof UPDATE_AUTHORS)[number];

export const ticketUpdateSchema = z.object({
  author: z.enum(UPDATE_AUTHORS),
  message: z.string(),
  createdAt: isoDateTime,
});

export const ticketSchema = z.object({
  number: z.string(),
  ownerId: z.string(),
  type: z.enum(TICKET_TYPES),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  status: z.enum(TICKET_STATUSES),
  affected: z.enum(AFFECTED_SCOPES),
  title: z.string(),
  description: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  lastStaffUpdateAt: isoDateTime.nullable(),
  resolvedAt: isoDateTime.nullable(),
  updates: z.array(ticketUpdateSchema),
});
export type TicketDto = z.infer<typeof ticketSchema>;

export const listTicketsResponseSchema = z.object({ tickets: z.array(ticketSchema) });

/** O dono vem sempre da api, que o tira da sessão; nunca do funcionário nem do LLM (RN09). */
const ownerIdSchema = z.string().min(1);

export const ticketFilterSchema = z.enum(["open", "all"]);

export const createTicketRequestSchema = z.object({
  ownerId: ownerIdSchema,
  draft: ticketDraftSchema,
});

export const MAX_UPDATE_MESSAGE_CHARS = 2000;

export const addTicketUpdateRequestSchema = z.object({
  ownerId: ownerIdSchema,
  author: z.enum(UPDATE_AUTHORS),
  message: z.string().trim().min(1).max(MAX_UPDATE_MESSAGE_CHARS),
});

export const ownerOnlyRequestSchema = z.object({ ownerId: ownerIdSchema });

/** Um analista assumiu o atendimento (tela 5, R31): o chamado fica "em atendimento". */
export const assumeTicketRequestSchema = z.object({
  ownerId: ownerIdSchema,
  analystName: z.string().trim().min(1).max(120),
});

export const transferTicketRequestSchema = z.object({
  ownerId: ownerIdSchema,
  /** Resumo do caso para o analista (RN07). */
  summary: z.string().trim().min(1).max(MAX_UPDATE_MESSAGE_CHARS),
});
