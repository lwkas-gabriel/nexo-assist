-- Revisão da T16: contadores diários de mensagens ao agent, no banco. Sobrevivem a reinícios e
-- deploys, e o dia é o da cota do provedor (o Gemini reinicia a cota à meia-noite do Pacífico).

CREATE TABLE usage_counters (
  scope TEXT NOT NULL,                         -- "global" ou "ip:<endereço>"
  day TEXT NOT NULL,                           -- AAAA-MM-DD no fuso da cota do provedor
  count INTEGER NOT NULL,
  PRIMARY KEY (scope, day)
);
