# ADR-0009: Migrações em SQL puro, Drizzle só para consultas

**Status:** Aceita (29/10/2026). Complementa o [ADR-0003](0003-sqlite-e-railway.md).

## Contexto
O ADR-0003 escolheu Drizzle com migrações versionadas. A ferramenta que gera as migrações do Drizzle (`drizzle-kit`) depende de `tsx` e `esbuild`, que têm script de instalação. Esse tipo de script derrubou o CI na T02 e foi removido na T01 (ADR-0004).

## Decisão
- **Migrações escritas à mão em SQL** (`apps/<serviço>/migrations/NNNN_nome.sql`), aplicadas na inicialização por um executor pequeno do próprio projeto, que registra cada uma em `schema_migrations` e roda cada arquivo numa transação.
- **Drizzle ORM só para as consultas**, com um schema TypeScript que espelha o SQL.
- Um teste aplica as migrações num banco em memória e grava e lê pelo Drizzle: se o SQL e o schema divergirem, o teste quebra.

## Alternativas descartadas
- **drizzle-kit:** traz dependências pesadas, com scripts de instalação, só para gerar arquivos.
- **SQL sem ORM:** consultas sem tipos, exigindo validar cada linha à mão.

## Consequências
- O schema fica em SQL puro: o formato mais fácil de ler e revisar num PR.
- O schema existe em dois lugares (SQL e TypeScript), protegidos pelo teste de banco.
- Migrações só avançam; não há reversão automática (aceitável num banco de demonstração recriável pelo seed).
