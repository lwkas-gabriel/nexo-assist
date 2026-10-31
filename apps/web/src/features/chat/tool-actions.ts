/** Como cada ação do agent aparece para o funcionário, no estilo do protótipo ("consultou seus chamados"). */
const TOOL_ACTION_LABELS: Record<string, string> = {
  search_knowledge_base: "buscou na central de ajuda",
  list_my_tickets: "consultou seus chamados",
  get_ticket: "consultou o chamado",
  propose_ticket_draft: "montou o rascunho",
  propose_ticket_update: "montou o complemento",
  confirm_draft: "confirmou o rascunho",
  ask_with_options: "ofereceu opções",
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
  return didNotComplete(output) ? `${label}${NOT_COMPLETED_SUFFIX}` : label;
}
