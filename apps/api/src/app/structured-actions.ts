import type { UIMessage } from "ai";
import { z } from "zod";
import { intentFromLabel, type ClassificationResult } from "../agent/classifier.ts";
import { LOW_CONFIDENCE_THRESHOLD } from "@nexo/shared/domain";
import type { toTicketDetails } from "../agent/ticket-view.ts";
import { ASK_WITH_OPTIONS_TOOL_ID } from "../agent/tools/draft-tools.ts";
import { GET_TICKET_TOOL_ID } from "../agent/tools/ticket-tools.ts";

/**
 * Ações estruturadas (11.5, R38): cliques que o código entende sem perguntar ao modelo.
 * Aqui ficam só as regras puras; o chat-service grava e responde.
 */

type TicketDetails = ReturnType<typeof toTicketDetails>;

const askedQuestionSchema = z.object({
  type: z.literal(`tool-${ASK_WITH_OPTIONS_TOOL_ID}`),
  state: z.literal("output-available"),
  output: z.object({ ok: z.literal(true), question: z.string(), options: z.array(z.string()) }),
});

/** A pergunta com respostas rápidas que a mensagem do agent fez, se fez. */
function askedQuestionOf(message: UIMessage): { question: string; options: string[] } | undefined {
  const asked = message.parts
    .map((part) => askedQuestionSchema.safeParse(part))
    .findLast((parsed) => parsed.success);
  return asked?.data.output;
}

/** O que o registro de decisão diz do turno que fez a pergunta. */
export type AskingTurn = { intent: string; classifierConfidence: number };

/**
 * R38: a resposta rápida clicada dispensa o classificador (só ele; o agent continua respondendo,
 * porque precisa da resposta para seguir). Vale só se a opção é uma das que o agent ofereceu na
 * mensagem mais recente da conversa, e a intenção continua a do turno que fez a pergunta.
 *
 * Volta ao classificador (devolve undefined) com pergunta antiga, texto que não é opção ou turno
 * que perguntou sem ter entendido ("não ficou claro" ou confiança baixa): aí o clique não pode
 * zerar a sequência de confiança baixa do R39.
 */
export function quickAnswerClassification(
  lastMessage: UIMessage | undefined,
  askingTurn: AskingTurn | undefined,
  answer: string,
): ClassificationResult | undefined {
  if (!lastMessage || lastMessage.role !== "assistant" || !askingTurn) return undefined;
  const asked = askedQuestionOf(lastMessage);
  const intent = intentFromLabel(askingTurn.intent);
  const askedWithoutUnderstanding =
    intent === "unclear" || askingTurn.classifierConfidence < LOW_CONFIDENCE_THRESHOLD;
  if (!asked || !asked.options.includes(answer) || !intent || askedWithoutUnderstanding) {
    return undefined;
  }
  return {
    ok: true,
    tokens: undefined,
    decidedBy: "quick_answer",
    classification: {
      intent,
      understood: `Respondeu "${answer}" à pergunta "${asked.question}".`,
      extracted: {},
      confidence: 1,
      reason:
        "Resposta rápida pelo botão: uma das opções que o agent ofereceu, sem passar pelo classificador (R38).",
    },
  };
}

/**
 * Resposta à seleção de um chamado (tela 3), montada pelo código: o estado, há quanto tempo a TI
 * não responde e o prazo, com a mesma conta que o agent usaria (RN12, A17). Vencido, oferece um
 * analista (RN07, A04); com a sessão no limite (RN14), o "sim" por texto seria recusado, então
 * aponta o botão.
 */
export function describeSelectedTicket(
  ticket: TicketDetails,
  { sessionAtLimit }: { sessionAtLimit: boolean },
): string {
  const lines = [`${ticket.number} · ${ticket.title}: ${ticket.status}.`];
  if (!ticket.isOpen) {
    lines.push(
      ticket.canReopen
        ? "Se o problema voltou, posso reabrir este chamado."
        : "Se o problema voltou, posso abrir um chamado novo.",
    );
    return lines.join(" ");
  }
  lines.push(
    ticket.lastTeamUpdateAt
      ? `A última resposta da equipe de TI foi há ${ticket.timeWithoutTeamResponse}.`
      : `A equipe de TI ainda não respondeu; aberto há ${ticket.timeWithoutTeamResponse}.`,
  );
  if (ticket.deadline?.isOverdue) {
    const offer = sessionAtLimit
      ? "Para falar com um analista, use o botão abaixo."
      : "Quer que eu chame um analista?";
    lines.push(`O prazo (${ticket.deadline.rule}) venceu em ${ticket.deadline.dueAt}. ${offer}`);
  } else if (ticket.deadline) {
    lines.push(`Próxima resposta prevista até ${ticket.deadline.dueAt} (${ticket.deadline.rule}).`);
  }
  return lines.join(" ");
}

const offeredTicketSchema = z.object({
  type: z.literal(`tool-${GET_TICKET_TOOL_ID}`),
  state: z.literal("output-available"),
  output: z.object({
    ok: z.literal(true),
    ticket: z.object({
      number: z.string(),
      isOpen: z.literal(true),
      deadline: z.object({ isOverdue: z.literal(true) }),
    }),
  }),
});

/**
 * O chamado vencido que a resposta oferece levar a um analista (RN07, A04), se oferece: a mesma
 * condição da tela (aberto e com o prazo vencido). Assim o "Não, obrigado" só vale para uma oferta
 * que existiu de verdade.
 */
export function offeredTicketNumber(message: UIMessage | undefined): string | undefined {
  if (!message || message.role !== "assistant") return undefined;
  const offered = message.parts
    .map((part) => offeredTicketSchema.safeParse(part))
    .findLast((parsed) => parsed.success);
  return offered?.data.output.ticket.number;
}

/** "Não, obrigado" à oferta de analista: o chamado segue na fila, e a porta fica aberta. */
export function declinedOfferText(ticketNumber: string): string {
  return `Combinado. O ${ticketNumber} continua com a equipe de TI; se mudar de ideia, é só me pedir um analista.`;
}

/**
 * A resposta gravada tem a mesma parte de tool que o agent produziria ao consultar o chamado:
 * a tela mostra o chip "consultou o INC-…" e o card do chamado sem saber que o modelo não rodou.
 */
export function selectedTicketParts(
  ticket: TicketDetails,
  toolCallId: string,
  options: { sessionAtLimit: boolean },
): UIMessage["parts"] {
  return [
    {
      type: `tool-${GET_TICKET_TOOL_ID}`,
      toolCallId,
      state: "output-available",
      input: { number: ticket.number },
      output: { ok: true, ticket },
    },
    { type: "text", text: describeSelectedTicket(ticket, options) },
  ];
}
