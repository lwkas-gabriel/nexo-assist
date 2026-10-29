# Registros de decisão (ADRs)

Cada arquivo registra uma decisão importante: contexto, decisão, alternativas descartadas e consequências. Curtos de propósito (meia página).
Para mudar uma decisão, escreva um ADR novo que substitui o anterior e marque o antigo como "Substituída por ADR-XXXX".

| ADR | Decisão | Status |
|---|---|---|
| [0001](0001-stack-e-monorepo.md) | React + Vite, Hono, Mastra, monorepo pnpm | Aceita |
| [0002](0002-servico-de-chamados-separado.md) | Serviço de chamados como app separado, com banco próprio | Aceita |
| [0003](0003-sqlite-e-railway.md) | SQLite (libSQL + Drizzle) e deploy no Railway | Aceita |
| [0004](0004-typescript-nativo-no-node.md) | TypeScript executado nativamente pelo Node 24, TS fixado na 6.0 | Aceita |
| [0005](0005-llm-interpreta-codigo-garante.md) | O LLM interpreta, o código garante as regras | Aceita |
| [0006](0006-turno-em-duas-etapas.md) | Turno em duas etapas + ações determinísticas para cliques | Aceita |
| [0007](0007-sessoes-de-chat.md) | Sessão de 30 mensagens com herança de contexto | Aceita |
| [0008](0008-modelo-claude-haiku.md) | Claude Haiku como modelo do agent | Aceita, a validar na T11 |
