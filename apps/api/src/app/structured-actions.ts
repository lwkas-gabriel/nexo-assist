import type { UIMessage } from "ai";
import { z } from "zod";
import { INTENTS, INTENT_LABELS, type ClassificationResult } from "../agent/classifier.ts";
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
export function askedQuestionOf(
  message: UIMessage,
): { question: string; options: string[] } | undefined {
  const asked = message.parts
    .map((part) => askedQuestionSchema.safeParse(part))
    .findLast((parsed) => parsed.success);
  return asked?.data.output;
}

/**
 * R38: a resposta rápida clicada dispensa o classificador. Vale só se a opção é uma das que o
 * agent ofereceu na mensagem mais recente da conversa, e a intenção continua a do turno que fez
 * a pergunta (o registro de decisão guarda o rótulo, como o detalhe mostra). Fora disso (pergunta antiga, texto que não é opção), devolve undefined e o turno
 * segue o caminho normal, com o classificador.
 */
export function quickAnswerClassification(
  lastMessage: UIMessage | undefined,
  askedIntentLabel: string | undefined,
  answer: string,
): ClassificationResult | undefined {
  if (!lastMessage || lastMessage.role !== "assistant") return undefined;
  const asked = askedQuestionOf(lastMessage);
  const intent = INTENTS.find((candidate) => INTENT_LABELS[candidate] === askedIntentLabel);
  if (!asked || !asked.options.includes(answer) || !intent) return undefined;
  return {
    ok: true,
    tokens: undefined,
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
 * analista (RN07, A04).
 */
export function describeSelectedTicket(ticket: TicketDetails): string {
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
    lines.push(
      `O prazo (${ticket.deadline.rule}) venceu em ${ticket.deadline.dueAt}. Quer que eu chame um analista?`,
    );
  } else if (ticket.deadline) {
    lines.push(`Próxima resposta prevista até ${ticket.deadline.dueAt} (${ticket.deadline.rule}).`);
  }
  return lines.join(" ");
}

/**
 * A resposta gravada tem a mesma parte de tool que o agent produziria ao consultar o chamado:
 * a tela mostra o chip "consultou o INC-…" e o card do chamado sem saber que o modelo não rodou.
 */
export function selectedTicketParts(ticket: TicketDetails, toolCallId: string): UIMessage["parts"] {
  return [
    {
      type: `tool-${GET_TICKET_TOOL_ID}`,
      toolCallId,
      state: "output-available",
      input: { number: ticket.number },
      output: { ok: true, ticket },
    },
    { type: "text", text: describeSelectedTicket(ticket) },
  ];
}
