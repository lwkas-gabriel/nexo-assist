-- T16: tokens do agent (etapa 2) em cada turno, além dos do classificador. Com os dois, o custo
-- por conversa sai dos registros (RT10).

ALTER TABLE decision_traces ADD COLUMN agent_tokens INTEGER;
