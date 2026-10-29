/** Como cada ação do agent aparece para o funcionário, no estilo do protótipo ("consultou seus chamados"). */
const TOOL_ACTION_LABELS: Record<string, string> = {
  search_knowledge_base: "buscou na central de ajuda",
};

const UNKNOWN_ACTION_LABEL = "executou uma ação";

export function describeToolAction(toolName: string): string {
  return TOOL_ACTION_LABELS[toolName] ?? UNKNOWN_ACTION_LABEL;
}
