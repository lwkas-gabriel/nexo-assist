import { createTool } from "@mastra/core/tools";
import {
  AFFECTED_SCOPES,
  TICKET_CATEGORIES,
  TICKET_DESCRIPTION_MAX_CHARS,
  TICKET_TITLE_MAX_CHARS,
  TICKET_TYPES,
  URGENCY_LEVELS,
} from "@nexo/shared/domain";
import { MAX_UPDATE_MESSAGE_CHARS } from "@nexo/shared/contracts";
import { z } from "zod";
import type { DraftService } from "../../app/draft-service.ts";
import { agentTurnFrom, hasReadTicketData } from "../agent-context.ts";
import { toolFailure } from "./tool-failure.ts";

export const PROPOSE_TICKET_DRAFT_TOOL_ID = "propose_ticket_draft";
export const PROPOSE_TICKET_UPDATE_TOOL_ID = "propose_ticket_update";
export const CONFIRM_DRAFT_TOOL_ID = "confirm_draft";
export const ASK_WITH_OPTIONS_TOOL_ID = "ask_with_options";

/** "D-12", "d12" ou "12" → 12. O agent repete o id que a tool de proposta devolveu. */
const DRAFT_ID_PATTERN = /^\s*(?:D[\s-]?)?(\d{1,9})\s*$/i;

function parseDraftId(text: string): number | undefined {
  const match = DRAFT_ID_PATTERN.exec(text);
  return match?.[1] ? Number(match[1]) : undefined;
}

/**
 * Tools que escrevem: só propõem rascunhos e confirmam o que o funcionário já viu (RN04, R04).
 * Quem é o funcionário e qual a conversa vêm do contexto do turno, nunca dos argumentos (RN09).
 */
export function createDraftTools({ draftService }: { draftService: DraftService }) {
  const proposeTicketDraft = createTool({
    id: PROPOSE_TICKET_DRAFT_TOOL_ID,
    description:
      "Monta o rascunho de um chamado novo para o funcionário conferir. Não cria o chamado. Mande o que já souber; a resposta diz o que falta, aponta chamados parecidos ou devolve o rascunho com a prioridade calculada.",
    inputSchema: z.object({
      title: z
        .string()
        .max(TICKET_TITLE_MAX_CHARS)
        .optional()
        .describe("Resumo curto do problema ou pedido"),
      description: z
        .string()
        .max(TICKET_DESCRIPTION_MAX_CHARS)
        .optional()
        .describe("O que acontece, desde quando, mensagens de erro e o que já foi tentado"),
      type: z
        .enum(TICKET_TYPES)
        .optional()
        .describe(
          "incident: algo parou ou não funciona; request: pedido de acesso, equipamento ou software",
        ),
      category: z.enum(TICKET_CATEGORIES).optional(),
      affected: z.enum(AFFECTED_SCOPES).optional().describe("Quem está sendo afetado"),
      urgency: z
        .enum(URGENCY_LEVELS)
        .optional()
        .describe(
          "blocked: trabalho parado sem alternativa; deadline_today: compromisso hoje em risco; has_workaround: atrapalha, mas há alternativa; no_urgency: pedido sem urgência",
        ),
      duplicatesReviewed: z
        .boolean()
        .describe(
          "true só depois que o funcionário disse que o problema é outro, diferente dos chamados parecidos apontados",
        ),
    }),
    execute: async ({ duplicatesReviewed, ...input }, context) => {
      const turn = agentTurnFrom(context);
      try {
        return await draftService.proposeNewTicket({
          employeeId: turn.employeeId,
          conversationId: turn.conversationId,
          input,
          duplicatesReviewed,
        });
      } catch (error) {
        return toolFailure(error);
      }
    },
  });

  const proposeTicketUpdate = createTool({
    id: PROPOSE_TICKET_UPDATE_TOOL_ID,
    description:
      "Monta o rascunho de um complemento para um chamado do funcionário. Se o chamado foi resolvido há até 7 dias, o complemento o reabre. Não envia nada até a confirmação.",
    inputSchema: z.object({
      number: z.string().min(1).max(40).describe("Número do chamado, ex.: INC-20311"),
      message: z
        .string()
        .trim()
        .min(1)
        .max(MAX_UPDATE_MESSAGE_CHARS)
        .describe("A informação nova, escrita como o funcionário contaria ao analista"),
    }),
    execute: async ({ number, message }, context) => {
      const turn = agentTurnFrom(context);
      try {
        return await draftService.proposeTicketUpdate({
          employeeId: turn.employeeId,
          conversationId: turn.conversationId,
          ticketNumber: number,
          message,
        });
      } catch (error) {
        return toolFailure(error);
      }
    },
  });

  const confirmDraft = createTool({
    id: CONFIRM_DRAFT_TOOL_ID,
    description:
      "Cria ou atualiza o chamado de um rascunho já mostrado. Use só quando o funcionário confirmar, nesta mensagem, o rascunho que viu antes (ex.: 'pode criar', 'confirmo').",
    inputSchema: z.object({
      draftId: z.string().min(1).max(20).describe("Id do rascunho, ex.: D-12"),
    }),
    execute: async ({ draftId }, context) => {
      const turn = agentTurnFrom(context);
      const draftNumber = parseDraftId(draftId);
      if (!draftNumber) return { ok: false as const, reason: "not_found" as const };
      if (hasReadTicketData(context)) {
        return {
          ok: false as const,
          reason: "refused" as const,
          detail: `Nesta resposta você leu dados de chamados; peça ao funcionário que confirme o rascunho D-${draftNumber} na próxima mensagem.`,
        };
      }
      try {
        const { draft, ticket } = await draftService.confirm({
          employeeId: turn.employeeId,
          draftNumber,
          conversationId: turn.conversationId,
          // R04: o rascunho precisa ter sido visto antes da mensagem que confirmou.
          source: { via: "chat", turnStartedAt: turn.startedAt },
        });
        return {
          ok: true as const,
          ticket: {
            number: ticket.number,
            title: ticket.title,
            // Só chamado novo tem previsão própria; o complemento segue o prazo do chamado.
            firstResponseBy: "ticket" in draft ? draft.ticket.firstResponseBy : null,
          },
          draft,
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  });

  const askWithOptions = createTool({
    id: ASK_WITH_OPTIONS_TOOL_ID,
    description:
      "Faz uma pergunta com respostas rápidas, que viram botões na tela. Use quando as respostas possíveis forem poucas e conhecidas (ex.: quem está sendo afetado).",
    inputSchema: z.object({
      question: z.string().min(1).max(200),
      options: z.array(z.string().min(1).max(80)).min(2).max(4),
    }),
    // Só leva a pergunta até a tela; a resposta chega como a próxima mensagem do funcionário.
    execute: ({ question, options }) => Promise.resolve({ ok: true as const, question, options }),
  });

  return {
    [PROPOSE_TICKET_DRAFT_TOOL_ID]: proposeTicketDraft,
    [PROPOSE_TICKET_UPDATE_TOOL_ID]: proposeTicketUpdate,
    [CONFIRM_DRAFT_TOOL_ID]: confirmDraft,
    [ASK_WITH_OPTIONS_TOOL_ID]: askWithOptions,
  };
}
