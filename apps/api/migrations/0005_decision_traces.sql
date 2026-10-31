-- Registro de decisão por turno do agent (RF05, R05): o que o classificador entendeu, o que o
-- agent fez, as regras aplicadas e a confiança final com os sinais que a reduziram (R09).

CREATE TABLE decision_traces (
  message_id TEXT PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,  -- a resposta do agent
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  trace TEXT NOT NULL,                         -- o registro completo, em JSON (o painel da T20 lê)
  final_confidence REAL NOT NULL,              -- separado para o limiar olhar o turno anterior (R39)
  classifier_tokens INTEGER,                   -- custo da etapa 1, quando o provedor informa
  latency_ms INTEGER NOT NULL,                 -- da mensagem do funcionário ao fim da resposta
  created_at INTEGER NOT NULL
);

CREATE INDEX decision_traces_conversation_idx ON decision_traces (conversation_id, created_at);
