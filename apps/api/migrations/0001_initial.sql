-- Usuários, sessões de login, conversas e mensagens da api.
-- Datas em milissegundos desde 1970 (UTC).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,                          -- employee | analyst
  department TEXT NOT NULL                     -- setor do funcionário ou nível do analista
);

-- Guarda só o hash do token: quem ler o banco não consegue se passar pelo usuário.
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users (id),
  mode TEXT NOT NULL,                          -- agent | waiting_analyst | analyst | closed
  assigned_analyst_id TEXT REFERENCES users (id),
  version INTEGER NOT NULL DEFAULT 1,          -- muda a cada troca de estado (concorrência, R06)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX conversations_employee_idx ON conversations (employee_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,                         -- gerado pelo servidor, nunca vindo do navegador
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  author TEXT NOT NULL,                        -- employee | agent | analyst | system
  author_id TEXT REFERENCES users (id),
  parts TEXT NOT NULL,                         -- partes da mensagem (texto, ações do agent) em JSON
  created_at INTEGER NOT NULL
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
