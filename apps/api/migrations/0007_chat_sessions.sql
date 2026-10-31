-- Sessões de atendimento dentro da conversa (RN14, A05, R03). A conversa continua a mesma; a
-- sessão é o trecho com limite de 30 mensagens ao agent. Termina no limite, por inatividade (8 h,
-- mas não com a conversa com um analista, R41) ou quando o funcionário pede uma nova.

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  status TEXT NOT NULL,                        -- active | ended
  agent_messages INTEGER NOT NULL DEFAULT 0,   -- mensagens do funcionário tratadas pelo agent (R42)
  summary TEXT,                                -- resumo gravado ao encerrar, mostrado na próxima
  ended_reason TEXT,                           -- limit | inactivity | new_session
  started_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX chat_sessions_conversation_idx ON chat_sessions (conversation_id, started_at);
