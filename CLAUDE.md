# CLAUDE.md — convenções do Nexo Assist

Guia para quem desenvolve neste repositório, pessoa ou IA. Vale como regra, não como sugestão.
Contexto completo: [docs/PLAN.md](docs/PLAN.md) (requisitos e tarefas), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/FRONTEND.md](docs/FRONTEND.md), [docs/REVIEW.md](docs/REVIEW.md) e [docs/decisions/](docs/decisions/).

## Fluxo de trabalho

- Uma tarefa do `docs/PLAN.md` por vez. Implementar só aquela tarefa.
- Trabalhar na branch `develop`. **Nunca** commitar direto na `main`; ela só recebe merge da `develop` por decisão do dono do projeto.
- Commits pequenos, um passo lógico cada, no padrão **Conventional Commits em português**: `feat(api): ...`, `fix(web): ...`, `test: ...`, `docs: ...`, `chore: ...`, `refactor: ...`. Escopos: `web`, `api`, `tickets-service`, `shared`, `agent`.
- Commits e PRs **sem** `Co-Authored-By` ou qualquer assinatura de IA. O uso de IA é documentado em `docs/AI_LOG.md`.
- Antes de considerar uma tarefa pronta: `pnpm typecheck`, `pnpm lint`, `pnpm test` (e `pnpm test:e2e` se tocar em fluxo) verdes.
- Ao concluir: marcar a tarefa no `docs/PLAN.md`, registrar no `docs/AI_LOG.md` o que foi pedido, gerado e corrigido, e atualizar o README se mudou como rodar ou alguma decisão.
- Decisão de arquitetura nova ou alterada: escrever ou atualizar um ADR em `docs/decisions/`.

## Comandos

| Comando                                        | O que faz                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm install`                                 | Instala dependências                                                   |
| `pnpm setup:env`                               | Cria o `.env` de cada app a partir do `.env.example` (não sobrescreve) |
| `pnpm dev`                                     | Sobe web (5173), api (3000) e tickets-service (3001)                   |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Tipos · lint · formatação                                              |
| `pnpm test` · `pnpm test:e2e`                  | Testes unitários (Vitest) · ponta a ponta (Playwright)                 |
| `pnpm build`                                   | Typecheck de tudo + build do front                                     |

## Estrutura

```
apps/web               React + Vite. src/features/<feature>/ (components, hooks, api), src/ui/ (design system), src/lib/
apps/api               Hono + agent Mastra. src/http/ → src/app/ (casos de uso) → src/ports/ ← src/adapters/; src/agent/
apps/tickets-service   Serviço de chamados simulado (legado), separado da api. src/http/, src/app/, src/db/
packages/shared        Código usado por mais de um app: config/, domain/ (regras puras), contracts/ (schemas Zod de HTTP)
e2e/                   Testes Playwright
docs/                  Plano, arquitetura, revisões, ADRs e registro de IA
```

- Direção das dependências: `http → app → ports ← adapters`. `domain` não depende de nada. O agent chama casos de uso, nunca banco ou HTTP diretamente.
- Cada app tem seu próprio `.env` com **só** as variáveis de que precisa (menor privilégio).
- Servidores rodam TypeScript **nativamente** no Node 24 (sem build): por isso imports relativos usam extensão explícita (`./app.ts`) e só sintaxe "apagável" (sem `enum`, sem `namespace`, sem parameter properties). Ver ADR-0004.

## Nomes e idioma

- **Identificadores em inglês** (variáveis, funções, tipos, arquivos, tabelas, rotas, tools do agent). **Português** em textos da interface, documentação, mensagens de commit e mensagens de erro para o usuário.
- Arquivos: `kebab-case.ts`; componentes React: `PascalCase.tsx`; testes ao lado do arquivo: `nome.test.ts`.
- Funções e variáveis em `camelCase`; tipos e componentes em `PascalCase`; constantes de verdade em `UPPER_SNAKE_CASE`.
- Booleanos com prefixo `is`/`has`/`can`/`should`. Funções começam com verbo (`computeDeadline`, `findOpenTickets`).
- Exports nomeados; `export default` só onde a ferramenta exige (arquivos de config).

### Glossário (português ↔ código)

| PRD                                     | Código                                          |
| --------------------------------------- | ----------------------------------------------- |
| chamado                                 | `ticket`                                        |
| incidente / requisição                  | `incident` / `request` (`INC` / `REQ`)          |
| rascunho                                | `draft`                                         |
| transferência para analista             | `handoff`                                       |
| central de ajuda / artigo               | `knowledgeBase` / `article`                     |
| funcionário / analista                  | `employee` / `analyst`                          |
| prazo (SLA) / vencido                   | `deadline` / `overdue`                          |
| prioridade: crítica, alta, média, baixa | `priority`: `critical`, `high`, `medium`, `low` |
| afetados / impacto / urgência           | `affected` / `impact` / `urgency`               |
| conversa / sessão                       | `conversation` / `chatSession`                  |
| registro de decisão                     | `decisionTrace`                                 |

## Boas práticas (obrigatórias)

**Legibilidade primeiro.** O código precisa ser entendido por quem não o escreveu.

- Funções pequenas, com uma responsabilidade e nome que diz o que fazem. Se precisa de "e" no nome, são duas funções.
- Retorno antecipado em vez de `if` aninhado. Sem ternário aninhado.
- Sem números ou textos mágicos: constantes nomeadas (`MAX_MESSAGES_PER_SESSION = 30`), com o ID da regra quando vier do PRD.
- Comentários explicam o **porquê**, não o quê. Código óbvio não leva comentário.
- Preferir dados imutáveis (`const`, `readonly`, retornar novos objetos) e funções puras.

**Tipos.**

- Nada de `any`. Para dados de fora, `unknown` + validação com Zod.
- Validar em **toda fronteira**: corpo HTTP, resposta do tickets-service, argumentos de tools do agent, variáveis de ambiente.
- Tipos derivados do schema (`z.infer`) em vez de declarar duas vezes.
- Uniões discriminadas para estados (`{ status: "pending" } | { status: "confirmed"; ticketId: string }`), não booleanos soltos.

**Design.**

- Regras de negócio em funções puras em `packages/shared/src/domain`, sem I/O. Uma regra em um só lugar.
- Dependências injetadas por funções-fábrica (`createChatService({ tickets, clock })`), sem framework de DI. Relógio sempre injetado (`Clock`), nunca `new Date()` espalhado em regra de negócio.
- Separar montagem de execução: `createApp()` não abre porta; `server.ts` só liga as peças.
- Abstração só com necessidade real (troca de implementação ou fake em teste). Duplicação pequena é aceitável até o terceiro uso.
- Máquinas de estado explícitas para conversa, chamado, rascunho e sessão (ver ARCHITECTURE 11.3).

**Erros.**

- Erros esperados são tipados (`AppError` com `code`), traduzidos para HTTP num único middleware.
- Nunca engolir erro (`catch {}` vazio). Ou trata, ou registra com contexto e propaga.
- Toda `Promise` é aguardada ou tratada (o lint barra promessas soltas).
- Mensagens ao usuário em português, honestas e sem detalhes internos.

**Frontend.**

- Componentes pequenos e por feature; o que é usado por mais de uma feature vai para `src/ui/`.
- Estado de servidor com TanStack Query; nada de store global além do contexto de sessão.
- Todo fluxo tem estado de carregamento, erro e vazio.
- Acessibilidade: elementos semânticos, rótulos, foco visível, navegação por teclado.

## Segurança e privacidade

- **Nenhuma chave, token, URL de banco ou valor de ambiente no código**, nem como valor padrão (`process.env.X ?? "valor"` é proibido). `process.env` só no `config.ts` de cada app, via `parseEnv` (`@nexo/shared/config`). O lint bloqueia o resto.
- `.env` nunca é versionado; `.env.example` só com nomes e placeholders.
- Nada sensível em variáveis do front: tudo do Vite vai para o navegador.
- O dono de um chamado vem **sempre da sessão**, nunca de parâmetro do cliente ou do LLM.
- O LLM nunca decide autorização nem grava diretamente: propõe, o código valida.
- Logs sem segredos e sem conteúdo de mensagens em nível info.

## Testes

- Unitários (Vitest) onde fazem diferença: regras de negócio, máquinas de estado, privacidade, confirmação, validação de config.
- Nome do teste em português, citando a regra quando houver: `it("RN06: reabre chamado resolvido há 7 dias")`.
- Estrutura preparar → agir → verificar. Um comportamento por teste.
- Sem rede e sem relógio real nos unitários: fakes das portas e `Clock` fixo.
- Rotas testadas com `createApp().request()`, sem subir servidor.
- E2E (Playwright) nos fluxos principais, em desktop e celular, com o LLM falso (`LLM_MODE=mock`).

## O que nunca fazer

- Commitar na `main`, adicionar `Co-Authored-By` ou assinar commits como IA.
- Escrever segredo ou valor de ambiente no código, ou ler `process.env` fora do `config.ts`.
- Usar `any`, `enum`, `// @ts-ignore` ou desligar regra de lint sem comentário justificando.
- Deixar o LLM criar/atualizar chamado sem as checagens do servidor, ou expor chamado de um funcionário a outro.
- Implementar algo fora da tarefa atual ou inventar requisito que não está nos documentos.
- Considerar uma tarefa pronta com typecheck, lint ou testes falhando.
