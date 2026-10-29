-- Respostas de escritas já processadas, para que um retry com a mesma chave
-- devolva o resultado original em vez de repetir a operação (achado R01).

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  path TEXT NOT NULL,                          -- a mesma chave não vale para outra operação
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
