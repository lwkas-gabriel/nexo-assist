-- Revisão da T15: no máximo uma sessão ativa por conversa, garantido pelo banco. Dois cliques
-- simultâneos em "Nova sessão" chegaram a deixar três sessões ativas.

CREATE UNIQUE INDEX chat_sessions_one_active_idx ON chat_sessions (conversation_id)
  WHERE status = 'active';
