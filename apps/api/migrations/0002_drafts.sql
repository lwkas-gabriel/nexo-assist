-- Rascunhos de chamado: o agent propõe, o funcionário confere e só então o chamado é criado
-- ou atualizado (RN04). O número (D-12) é o que aparece no card e nas mensagens.

CREATE TABLE drafts (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL,                          -- create | update | reopen
  ticket_number TEXT,                          -- chamado alvo (update/reopen) ou criado (create)
  content TEXT NOT NULL,                       -- campos do chamado ou complemento, em JSON
  priority_reason TEXT,                        -- justificativa da prioridade (RN11), só em create
  status TEXT NOT NULL,                        -- pending | confirmed | cancelled
  idempotency_key TEXT NOT NULL UNIQUE,        -- aleatória: um retry nunca duplica o chamado (R01)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL                  -- última vez que o conteúdo mudou (R04)
);

CREATE INDEX drafts_conversation_idx ON drafts (conversation_id, status);
