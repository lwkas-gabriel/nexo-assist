-- Revisão da T14: o limiar (R39) compara a mesma medida nas duas mensagens (a confiança do
-- classificador, que é o que o agent recebe) e só dentro do mesmo período com o agent: a versão
-- da conversa muda a cada transferência ou devolução, e isso zera a sequência.

ALTER TABLE decision_traces ADD COLUMN classifier_confidence REAL;
ALTER TABLE decision_traces ADD COLUMN conversation_version INTEGER;
