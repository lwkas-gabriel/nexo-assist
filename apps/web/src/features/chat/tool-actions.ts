import { TICKET_SERVICE_MAX_ATTEMPTS } from "@nexo/shared/contracts";
import { isToolUIPart, type UIMessage } from "ai";

/** Como cada ação do agent aparece para o funcionário, no estilo do protótipo ("consultou seus chamados"). */
const TOOL_ACTION_LABELS: Record<string, string> = {
  search_knowledge_base: "buscou na central de ajuda",
  list_my_tickets: "consultou seus chamados",
  get_ticket: "consultou o chamado",
  propose_ticket_draft: "montou o rascunho",
  propose_ticket_update: "montou o complemento",
  confirm_draft: "confirmou o rascunho",
  ask_with_options: "ofereceu opções",
  handoff_to_analyst: "chamou um analista",
};

const UNKNOWN_ACTION_LABEL = "executou uma ação";
const NOT_COMPLETED_SUFFIX = " (não concluiu)";

const TICKETS_UNAVAILABLE_REASON = "tickets_unavailable";

/** As tools respondem `{ ok: false, ... }` quando a ação não aconteceu (ex.: faltou informação). */
export function didNotComplete(output: unknown): boolean {
  return typeof output === "object" && output !== null && "ok" in output && output.ok === false;
}

function reasonOf(output: unknown): unknown {
  return typeof output === "object" && output !== null && "reason" in output
    ? output.reason
    : undefined;
}

/**
 * 10.5: alguma tool desta resposta não conseguiu falar com o sistema de chamados (a api já tentou
 * as vezes que a política manda, RT05). É o caso em que a tela oferece um analista.
 */
export function hasTicketsUnavailable(message: UIMessage): boolean {
  return message.parts
    .filter(isToolUIPart)
    .some(
      (part) =>
        part.state === "output-available" &&
        didNotComplete(part.output) &&
        reasonOf(part.output) === TICKETS_UNAVAILABLE_REASON,
    );
}

/** Rótulo da ação; se a tool respondeu que não concluiu, o chip diz isso em vez de dar a ação por feita. */
export function describeToolAction(toolName: string, output?: unknown): string {
  const label = TOOL_ACTION_LABELS[toolName] ?? UNKNOWN_ACTION_LABEL;
  if (didNotComplete(output)) {
    return reasonOf(output) === TICKETS_UNAVAILABLE_REASON
      ? `sistema de chamados instável, tentei ${TICKET_SERVICE_MAX_ATTEMPTS}×`
      : `${label}${NOT_COMPLETED_SUFFIX}`;
  }
  // Tela 3: "consultou o INC-20311", com o número que a consulta devolveu.
  const number = consultedNumber(output);
  return toolName === "get_ticket" && number ? `consultou o ${number}` : label;
}

function consultedNumber(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null || !("ticket" in output)) return undefined;
  const { ticket } = output;
  return typeof ticket === "object" && ticket !== null && "number" in ticket
    ? String(ticket.number)
    : undefined;
}
