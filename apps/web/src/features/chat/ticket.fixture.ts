import type { UIMessage } from "ai";
import type { TicketDetailsView } from "./ticket-model.ts";

/** Chamado como a api manda nas saídas das tools (só testes importam este arquivo). */
export const overdueTicket: TicketDetailsView = {
  number: "INC-20311",
  title: "Notebook lento após atualização do Windows",
  category: "Hardware",
  priority: "Média",
  status: "Aguardando analista",
  statusCode: "waiting_analyst",
  isOpen: true,
  openedAt: "16/10, 14:20",
  openedOn: "16 out",
  lastTeamUpdateAt: "22/10, 14:20",
  timeWithoutTeamResponse: "5 dias",
  deadline: { rule: "3 dias úteis", dueAt: "27/10, 14:20", isOverdue: true },
  description: "Lentidão geral desde a atualização de 15/10.",
};

export const onTimeTicket: TicketDetailsView = {
  ...overdueTicket,
  number: "INC-20298",
  title: "Acesso à pasta Financeiro no SharePoint",
  status: "Em andamento",
  statusCode: "in_progress",
  timeWithoutTeamResponse: "1 dia",
  deadline: { rule: "3 dias úteis", dueAt: "03/11, 14:20", isOverdue: false },
};

/** Resposta do agent com a saída de uma tool de chamados. */
export function agentWithTool(id: string, toolName: string, output: unknown, text = ""): UIMessage {
  return {
    id,
    role: "assistant",
    metadata: { author: "agent" },
    parts: [
      {
        type: `tool-${toolName}`,
        toolCallId: `c-${id}`,
        state: "output-available",
        input: {},
        output,
      },
      ...(text ? [{ type: "text" as const, text }] : []),
    ],
  };
}
