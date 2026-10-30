-- A chave é reservada antes de executar a escrita (status 0 = em andamento), para que duas
-- requisições simultâneas com a mesma chave não executem as duas (revisão da T12).
-- request_hash: a mesma chave com outro conteúdo é recusada, em vez de devolver a resposta antiga.

ALTER TABLE idempotency_keys ADD COLUMN request_hash TEXT;
