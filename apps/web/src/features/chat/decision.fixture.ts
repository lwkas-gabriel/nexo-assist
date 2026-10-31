import type { DecisionView } from "@nexo/shared/contracts";

/** Registro de decisão de exemplo para os testes da tela (só testes importam este arquivo). */
export const sampleDecision: DecisionView = {
  intent: "abrir chamado",
  understood: "A VPN não conecta e há reunião às 14h.",
  extracted: { category: "network_vpn", urgency: "deadline_today", ticketNumber: "INC-20311" },
  classifierConfidence: 0.9,
  finalConfidence: 0.75,
  isLowConfidence: false,
  reason: "Relata um problema e pede atendimento.",
  steps: [
    { tool: "search_knowledge_base", ok: true, outcome: "0 artigo(s) encontrado(s)" },
    { tool: "propose_ticket_draft", ok: true, outcome: "concluiu" },
  ],
  rules: ["RN11: somente você + compromisso hoje → Alta"],
  signals: [
    {
      code: "kb_without_answer",
      label: "a central de ajuda não tinha artigo sobre isso",
      penalty: 0.15,
    },
  ],
};
