-- Transferências para analista (RN07). O resumo é escrito pelo agent na chamada da tool (R17);
-- o nível (A03) e o prazo de contato (A02) são calculados pelo código.

CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,                         -- também é a base da chave de idempotência (R01)
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  reason TEXT NOT NULL,                        -- employee_request | critical | overdue | low_confidence
  support_level TEXT NOT NULL,                 -- N1 | N2
  problem TEXT NOT NULL,                       -- resumo: o problema
  attempted TEXT NOT NULL,                     -- resumo: o que já foi tentado
  ticket_number TEXT,                          -- chamado ligado, se houver
  ticket_transferred INTEGER NOT NULL,         -- 1 se o chamado foi marcado como aguardando analista
  response_due_at INTEGER NOT NULL,            -- até quando um analista fala com o funcionário (A02)
  created_at INTEGER NOT NULL
);

CREATE INDEX handoffs_conversation_idx ON handoffs (conversation_id, created_at);
