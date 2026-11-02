-- T23: "online" no console (A20): quando o funcionário carregou a conversa pela última vez. Também
-- marca as mensagens que saíram para ele como vistas (✓✓).
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;

-- T23: mensagens não lidas no console: a última vez que um analista abriu a conversa.
ALTER TABLE conversations ADD COLUMN analyst_read_at INTEGER;
