# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras, e o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa. Do outro lado, o analista acompanha e assume conversas num console.

> **Status:** em desenvolvimento. Esta é a base do projeto (tarefa T01); as funcionalidades entram tarefa a tarefa, conforme o [plano](docs/PLAN.md).
>
> **Deploy:** _link será adicionado após a tarefa T02b._

## Como rodar

**Pré-requisitos:** Node.js 24 ou superior e pnpm 12 (`npm install -g pnpm` ou `corepack enable`).

```bash
pnpm install       # instala as dependências
pnpm setup:env     # cria o .env de cada app a partir do .env.example
pnpm dev           # sobe web (http://localhost:5173), api (:3000) e tickets-service (:3001)
```

Acesse http://localhost:5173.

### Outros comandos

| Comando                                        | O que faz                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                    | Testes unitários (Vitest)                                                                                         |
| `pnpm test:e2e`                                | Testes ponta a ponta (Playwright), em desktop e celular. Na primeira vez: `pnpm exec playwright install chromium` |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Lint · checagem de tipos · formatação                                                                             |
| `pnpm build`                                   | Checagem de tipos de tudo + build do front                                                                        |

### Variáveis de ambiente

Cada app tem o próprio `.env.example`, com só o que aquele app precisa. Nenhum valor de ambiente fica no código: tudo é lido e validado num único `config.ts` por app, e a aplicação não sobe se faltar alguma variável.

| App             | Variável           | Para quê                                                             |
| --------------- | ------------------ | -------------------------------------------------------------------- |
| api             | `PORT`             | Porta HTTP da api                                                    |
| tickets-service | `PORT`             | Porta HTTP do serviço de chamados                                    |
| web             | `API_PROXY_TARGET` | Só no desenvolvimento: para onde o Vite encaminha as chamadas `/api` |

_Contas de demonstração (funcionários e analista): serão listadas aqui com o seed de dados (T07)._

## Estrutura do projeto

```
apps/web               Interface (React + Vite): chat do funcionário e console do analista
apps/api               Servidor (Hono): autenticação, chat, console e o agent (Mastra)
apps/tickets-service   Serviço de chamados simulado (legado instável), separado da api
packages/shared        Código compartilhado: leitura de configuração, regras de negócio, contratos
e2e/                   Testes ponta a ponta (Playwright)
docs/                  Plano, arquitetura, revisões, decisões (ADRs) e registro de uso de IA
```

## Principais decisões

Cada decisão tem um registro curto com contexto, alternativas descartadas e consequências em [docs/decisions/](docs/decisions/).

- **Separação em três apps** ([ADR-0001](docs/decisions/0001-stack-e-monorepo.md), [ADR-0002](docs/decisions/0002-servico-de-chamados-separado.md)): interface, api com o agent e serviço de chamados, com regras de negócio num pacote compartilhado.
- **O LLM interpreta, o código garante as regras** ([ADR-0005](docs/decisions/0005-llm-interpreta-codigo-garante.md)): confirmação antes de criar, pausa durante atendimento humano e privacidade entre funcionários são garantidas pelo servidor, não pelo prompt.
- **Transparência em todo turno** ([ADR-0006](docs/decisions/0006-turno-em-duas-etapas.md)): um classificador registra o que foi entendido, com confiança e justificativa, antes de o agent agir.
- **TypeScript nativo no Node 24** ([ADR-0004](docs/decisions/0004-typescript-nativo-no-node.md)): os servidores rodam direto do código-fonte, sem etapa de build.
- **SQLite e Railway** ([ADR-0003](docs/decisions/0003-sqlite-e-railway.md)): persistência sem Docker localmente e deploy com disco persistente.
- **Claude Haiku** ([ADR-0008](docs/decisions/0008-modelo-claude-haiku.md)): rápido e barato, bom em tool use.

_Seções a completar ao longo do desenvolvimento: como o agent decide, como a qualidade das decisões foi garantida, segurança, trade-offs e custo por conversa._

## Suposições

O PRD e o protótipo deixam pontos em aberto e alguns se contradizem. Cada ambiguidade foi registrada com a pergunta que faríamos ao recrutador e a suposição adotada: [docs/PLAN.md, seção 4](docs/PLAN.md#4-ambiguidades-e-contradições-mock--prd).

## Desenvolvimento assistido por IA

O projeto foi desenvolvido com o Claude Code, guiado por:

- [CLAUDE.md](CLAUDE.md): convenções, boas práticas e o que nunca fazer;
- [docs/PLAN.md](docs/PLAN.md): requisitos numerados e tarefas pequenas, implementadas uma por vez;
- [docs/REVIEW.md](docs/REVIEW.md): revisões adversariais do plano antes de escrever código.

O que foi pedido, o que a IA gerou e o que foi corrigido estão em [docs/AI_LOG.md](docs/AI_LOG.md). _Exemplos concretos serão resumidos aqui na entrega._

## O que faria com mais tempo

_A completar na entrega._
