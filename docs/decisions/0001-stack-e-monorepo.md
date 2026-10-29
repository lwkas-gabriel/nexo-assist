# ADR-0001: React + Vite, Hono, Mastra em monorepo pnpm

**Status:** Aceita (29/10/2026)

## Contexto
O PRD exige TypeScript estrito e Mastra (preferência) ou LangGraph.js, sugere Next.js ou React e pede separação clara entre interface, agent e serviços. O projeto precisa de front, servidor com o agent e um serviço de chamados simulado.

## Decisão
- **Front:** React 19 + Vite (SPA). As telas são todas autenticadas e interativas; não há ganho em renderizar no servidor.
- **Servidor:** Hono sobre Node, com o agent **Mastra** dentro da api.
- **Monorepo pnpm** com `apps/web`, `apps/api`, `apps/tickets-service` e `packages/shared` (regras de negócio e contratos usados por mais de um app).

## Alternativas descartadas
- **Next.js:** junta interface e servidor no mesmo app, justamente a separação que o PRD avalia, e traz mais conceitos (server components, cache) sem benefício aqui.
- **LangGraph.js:** o PRD prefere Mastra.
- **Repositórios separados:** duplicariam regras de negócio e contratos.

## Consequências
- Fronteiras explícitas entre apps, visíveis na estrutura de pastas.
- Regras de negócio escritas uma vez em `packages/shared` e usadas por todos.
- Mais de um processo para rodar, resolvido com `pnpm dev`.
