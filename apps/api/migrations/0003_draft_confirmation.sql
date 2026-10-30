-- Revisão da T12.
-- shown_at: quando o funcionário viu o rascunho (o agent o mostrou numa resposta concluída ou o
-- funcionário o editou no card). Pelo chat, só confirma rascunho visto antes da mensagem (R04).
-- Status novos: confirming (confirmação em andamento, reservada de forma atômica) e
-- confirm_failed (a escrita falhou e pode ter acontecido: o rascunho fica congelado e só aceita
-- confirmar de novo, com a mesma chave de idempotência).

ALTER TABLE drafts ADD COLUMN shown_at INTEGER;
