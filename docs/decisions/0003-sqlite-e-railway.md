# ADR-0003: SQLite (libSQL + Drizzle) e deploy no Railway

**Status:** Aceita (29/10/2026)

## Contexto
Conversas, chamados e o estado de cada conversa precisam sobreviver a um reinício. O projeto deve rodar localmente com poucos comandos e ter um deploy público (diferencial).

## Decisão
- **SQLite** via libSQL, com **Drizzle** (schema tipado e migrações versionadas). Um arquivo por serviço (`api.db`, `tickets.db`).
- **Railway:** dois serviços (a api servindo o front, e o tickets-service), cada um com volume persistente para o SQLite. Deploy contínuo a partir da `main`.

## Alternativas descartadas
- **Postgres:** exigiria Docker localmente ou um banco externo, ou seja, mais um passo e mais uma conta.
- **Vercel (serverless):** sem disco persistente, obrigaria um banco externo (Turso/Neon). Um servidor de longa duração combina melhor com streaming e polling.

## Consequências
- Rodar localmente não exige Docker nem serviço externo.
- Um único processo de escrita por banco, adequado à escala do desafio. Para escalar horizontalmente seria preciso migrar para Postgres, o que o Drizzle facilita.
- O Railway não tem plano gratuito; o custo fica documentado no README.
