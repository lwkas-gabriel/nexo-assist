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

/** As tools respondem `{ ok: false, ... }` quando a ação não aconteceu (ex.: faltou informação). */
function didNotComplete(output: unknown): boolean {
  return typeof output === "object" && output !== null && "ok" in output && output.ok === false;
}

/** Rótulo da ação; se a tool respondeu que não concluiu, o chip diz isso em vez de dar a ação por feita. */
export function describeToolAction(toolName: string, output?: unknown): string {
  const label = TOOL_ACTION_LABELS[toolName] ?? UNKNOWN_ACTION_LABEL;
  if (didNotComplete(output)) return `${label}${NOT_COMPLETED_SUFFIX}`;
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
