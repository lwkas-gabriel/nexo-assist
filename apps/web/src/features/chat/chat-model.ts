import { getToolName, isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import type { DraftView, SessionView } from "./chat-api.ts";

/**
 * Leitura das mensagens do chat, sem React: quem falou, o rascunho e as opções que vieram das
 * tools, e o estado atual de cada rascunho. A tela só desenha o que sai daqui.
 */

export type MessageAuthor = "employee" | "agent" | "analyst" | "system";

function metadataOf(message: UIMessage): Record<string, unknown> {
  return typeof message.metadata === "object" && message.metadata !== null
    ? (message.metadata as Record<string, unknown>)
    : {};
}

/** Quem escreveu. Sem metadado (mensagem ainda em streaming), vale o papel do AI SDK. */
export function messageAuthor(message: UIMessage): MessageAuthor {
  const author = metadataOf(message).author;
  if (author === "employee" || author === "agent" || author === "analyst" || author === "system") {
    return author;
  }
  return message.role === "user" ? "employee" : "agent";
}

export function messageCreatedAt(message: UIMessage): string | undefined {
  const createdAt = metadataOf(message).createdAt;
  return typeof createdAt === "string" ? createdAt : undefined;
}

/** Nome e setor de quem escreveu, nas mensagens de um analista (R27). */
export function messageAnalyst(
  message: UIMessage,
): { name: string; department: string } | undefined {
  const analyst = metadataOf(message).analyst;
  if (typeof analyst !== "object" || analyst === null) return undefined;
  const { name, department } = analyst as Record<string, unknown>;
  return typeof name === "string" && typeof department === "string"
    ? { name, department }
    : undefined;
}

/** O texto da mensagem, sem as partes de tool. */
export function textOf(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

/** A mensagem mais recente do funcionário: a que fica sem resposta quando o envio falha. */
export function lastEmployeeMessage(messages: readonly UIMessage[]): UIMessage | undefined {
  return messages.findLast((message) => messageAuthor(message) === "employee");
}

/** Saída de uma tool já concluída, pelo nome. */
function toolOutput(message: UIMessage, toolName: string): unknown {
  const part = message.parts
    .filter(isToolUIPart)
    .findLast((candidate) => getToolName(candidate) === toolName);
  return part?.state === "output-available" ? part.output : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** RF07: o rascunho que o agent propôs nesta mensagem (chamado novo ou complemento). */
export function proposedDraft(message: UIMessage): DraftView | undefined {
  for (const toolName of ["propose_ticket_draft", "propose_ticket_update"]) {
    const output = toolOutput(message, toolName);
    if (isRecord(output) && output.ok === true && isRecord(output.draft)) {
      return output.draft as DraftView;
    }
  }
  return undefined;
}

export type QuickOptions = { question: string; options: string[] };

/** RF06: a pergunta com opções rápidas desta mensagem. */
export function quickOptionsOf(message: UIMessage): QuickOptions | undefined {
  const output = toolOutput(message, "ask_with_options");
  if (!isRecord(output) || output.ok !== true) return undefined;
  const { question, options } = output;
  if (typeof question !== "string" || !Array.isArray(options)) return undefined;
  return { question, options: options.filter((option) => typeof option === "string") };
}

/** O estado atual do rascunho (a conversa traz todos); sem ele, o da hora em que foi proposto. */
export function liveDraft(proposal: DraftView, drafts: readonly DraftView[]): DraftView {
  return drafts.find((draft) => draft.number === proposal.number) ?? proposal;
}

/**
 * O rascunho que o Ctrl/⌘+Enter confirma: o proposto mais recente, se ainda puder ser
 * confirmado (pendente, ou com uma confirmação que falhou e pode ser repetida).
 */
export function confirmableDraft(
  messages: readonly UIMessage[],
  drafts: readonly DraftView[],
): DraftView | undefined {
  const proposal = messages.map(proposedDraft).findLast((draft) => draft !== undefined);
  if (!proposal) return undefined;
  const live = liveDraft(proposal, drafts);
  return live.status === "pending" || live.status === "confirm_failed" ? live : undefined;
}

/**
 * R03: onde entra o card "Resumo da sessão anterior": antes da primeira mensagem da sessão atual,
 * ou no fim, quando ela ainda não começou. Sem resumo, não entra.
 */
export function sessionSummaryIndex(
  messages: readonly UIMessage[],
  session: SessionView | null,
): number | undefined {
  if (!session?.previousSummary) return undefined;
  if (!session.startedAt) return messages.length;
  const startedAt = session.startedAt;
  const index = messages.findIndex((message) => {
    const createdAt = messageCreatedAt(message);
    return createdAt !== undefined && createdAt >= startedAt;
  });
  return index === -1 ? messages.length : index;
}
