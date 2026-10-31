/**
 * Custo e latência por turno e por conversa (RT10), a partir dos registros de decisão. É o que o
 * README cita como custo médio, e o que a avaliação da T27 mede.
 */
export type UsageRow = {
  conversationId: string;
  /** Clique de botão (confirmar, cancelar, falar com analista): não é turno do modelo. */
  isButtonAction: boolean;
  classifierTokens: number | null;
  agentTokens: number | null;
  latencyMs: number;
};

export type UsageReport = {
  turns: number;
  conversations: number;
  tokensPerTurn: number;
  tokensPerConversation: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
};

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

export function summarizeUsage(allRows: readonly UsageRow[]): UsageReport {
  const rows = allRows.filter((row) => !row.isButtonAction);
  const tokens = rows.map((row) => (row.classifierTokens ?? 0) + (row.agentTokens ?? 0));
  const total = tokens.reduce((sum, value) => sum + value, 0);
  const conversations = new Set(rows.map((row) => row.conversationId)).size;
  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  return {
    turns: rows.length,
    conversations,
    tokensPerTurn: rows.length === 0 ? 0 : Math.round(total / rows.length),
    tokensPerConversation: conversations === 0 ? 0 : Math.round(total / conversations),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
  };
}
