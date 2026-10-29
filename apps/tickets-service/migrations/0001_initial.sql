-- Chamados e o histórico de atualizações de cada um.
-- Datas em milissegundos desde 1970 (UTC); o fuso só importa na exibição e no cálculo de prazos.

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,                 -- INC-20311, REQ-10442
  type TEXT NOT NULL,                          -- incident | request
  sequence INTEGER NOT NULL,                   -- parte numérica, para gerar o próximo número
  owner_id TEXT NOT NULL,                      -- funcionário que abriu (RN09)
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  affected TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_staff_update_at INTEGER,                -- última atualização da equipe de TI (prazo, A17)
  resolved_at INTEGER,                         -- janela de reabertura (RN06)
  UNIQUE (type, sequence)
);

-- Toda consulta filtra pelo dono: o índice deixa isso barato.
CREATE INDEX tickets_owner_idx ON tickets (owner_id);

CREATE TABLE ticket_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author TEXT NOT NULL,                        -- employee | staff | agent | system
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX ticket_updates_ticket_idx ON ticket_updates (ticket_id);
