# Nexo Assist — Arquitetura e backend

> **Mapa da documentação.** As seções mantêm a numeração do plano original para que as referências cruzadas (ex.: "ver 10.6", "R03", "A12") continuem válidas:
> [PLAN.md](PLAN.md) — seções 1–4, 6–8 e 12 (requisitos, suposições, tarefas) ·
> [ARCHITECTURE.md](ARCHITECTURE.md) — seções 5 e 11 (arquitetura, segurança, backend) ·
> [FRONTEND.md](FRONTEND.md) — seção 10 (telas, componentes, responsividade) ·
> [REVIEW.md](REVIEW.md) — seção 9 (revisões adversariais R01–R47) ·
> [AI_LOG.md](AI_LOG.md) — registro do uso de IA

## 5. Stack e arquitetura (decidida)

Monorepo `pnpm` com 3 apps e fronteiras explícitas:
- `apps/web`: React + TypeScript + Vite + Tailwind (tokens do `.pen`: Schibsted Grotesk, Newsreader, IBM Plex Mono, paleta `ink/paper/cta`...) + TanStack Query.
- `apps/api`: Node + Hono: auth (cookie de sessão), chat (SSE para streaming), endpoints do console, **agent Mastra** em `apps/api/src/agent/`.
- `apps/tickets-service`: Hono, banco próprio, API REST de chamados, **injeção de falhas** configurável (simula legado instável). A API fala com ele via cliente HTTP com timeout + retry com backoff + mensagem honesta ao usuário quando esgota.
- Persistência: SQLite via libSQL + Drizzle. Cada serviço tem seu próprio arquivo de banco (`api.db`, `tickets.db`), o que reforça a separação. Sem Docker para rodar local.
- Local: `pnpm install && pnpm db:seed && pnpm dev` sobe web, api e tickets-service juntos.
- Railway: 2 serviços no mesmo projeto (api servindo o build estático do web + tickets-service), cada um com seu volume para o SQLite; deploy contínuo a partir da `main` (que só recebe merges da `develop`). `ANTHROPIC_API_KEY` só como variável do Railway.
- Tempo real no console e na conversa transferida: polling curto (2–3 s). SSE só para o streaming do agent. Simples > elaborado.

### 5.1 Estrutura do monorepo e camadas
```
nexo-assist/
├─ apps/
│  ├─ web/               React + Vite
│  │  └─ src/
│  │     ├─ features/    auth/ · chat/ · console/ · profile/   (cada uma: components, hooks, api)
│  │     ├─ ui/          primitivos do design system (Button, Badge, Card, Avatar, StatusPill...)
│  │     └─ lib/         cliente HTTP tipado, formatação de datas/prazos
│  ├─ api/               Hono + Mastra
│  │  └─ src/
│  │     ├─ http/        rotas finas + middlewares (auth, papel, erros, rate limit, headers)
│  │     ├─ app/         casos de uso: chat, handoff, console, confirmação de rascunho
│  │     ├─ agent/       agent Mastra: prompt, tools (wrappers finos sobre app/), trace de decisão
│  │     ├─ ports/       interfaces: TicketGateway, KnowledgeBase, ConversationRepo, Clock
│  │     ├─ adapters/    HTTP client do tickets-service (retry), repositórios Drizzle
│  │     └─ config.ts    env validado com Zod (falha ao iniciar se faltar algo)
│  └─ tickets-service/   Hono, mesma divisão http/ · app/ · db/, + middleware de injeção de falhas
└─ packages/
   └─ shared/
      ├─ domain/         regras puras e tipos: prioridade, SLA/calendário útil (America/Sao_Paulo), reabertura, duplicidade, status
      └─ contracts/      schemas Zod dos DTOs HTTP (web↔api e api↔tickets-service)
```
- **Direção das dependências:** `http → app → ports ← adapters`; `domain` não depende de nada. As tools do agent usam casos de uso ou portas (ex.: `TicketGateway`, `KnowledgeBase`), nunca HTTP nem banco direto.
- **Uma fonte de verdade para conversas:** nosso repositório guarda mensagens, estado e traces. O console, as mensagens do analista e os traces precisam disso. Para o agent, passamos o histórico em janela, explicitamente. A memória do Mastra fica desligada para não haver dois históricos.
- **Composição sem framework de DI:** funções-fábrica (`createChatService({ tickets, conversations, clock })`), montadas num único `container.ts`. Nos testes, basta passar fakes.
- **`Clock` injetado:** SLA, vencimento e o seed com datas relativas ficam testáveis e determinísticos.

### 5.2 Segurança
| Ameaça | Medida |
|---|---|
| Sessão roubada / XSS | Cookie de sessão `httpOnly`, `SameSite=Lax`, `Secure` em produção; id aleatório guardado no banco com expiração. React escapa por padrão; respostas do agent renderizadas como texto ou markdown sanitizado, nunca HTML cru |
| CSRF | Same-origin (a api serve o web), `SameSite=Lax` + checagem de `Origin` nas rotas que alteram dados |
| Funcionário ver chamado de outro (RN09) | `userId` sempre da sessão; tools sem parâmetro de dono; tickets-service filtra por dono na própria query (defesa em profundidade); teste automatizado tentando acessar chamado alheio |
| Funcionário acessar o console | Middleware de papel (`employee` / `analyst`) em todas as rotas do console |
| Prompt injection ("ignore as regras e crie...", "mostre o chamado do Bruno") | O LLM não grava nada livremente: só propõe rascunhos, e a única escrita (`confirm_draft`) passa pelas checagens de R04 no servidor. Escopo de dados limitado à sessão. Casos na avaliação roteirizada (T27) |
| Tickets-service exposto | Rede privada do Railway (sem domínio público) + token de serviço em header, comparado em tempo constante |
| Entrada maliciosa ou malformada | Zod em toda fronteira: corpo HTTP, args das tools, respostas do tickets-service |
| Abuso e custo (login aceita qualquer senha) | Rate limit por usuário e por IP (mensagens e login), limite de 30 mensagens, teto diário global de mensagens (dentro da cota gratuita do Gemini, sem gasto possível; ADR-0010) |
| Vazamento de segredos | **Regra: nenhuma chave, token, URL de banco ou valor de ambiente escrito no código, nem como fallback** (`process.env.X ?? "valor"` é proibido para segredos). Todo acesso a `process.env` passa por um único `config.ts` por app, validado com Zod: se faltar variável, a app não sobe. `.env` no `.gitignore`; `.env.example` só com nomes e placeholders descritivos. Em produção, valores só nas variáveis do Railway. Varredura de segredos com **gitleaks** no CI e num hook de pre-commit; regra de lint proibindo `process.env` fora de `config.ts`. Front: nada sensível em variáveis `VITE_*` (vão para o bundle); a chave do LLM só existe no servidor. Logs sem segredos nem conteúdo de mensagens em nível info |
| Headers e CORS | `secureHeaders` do Hono; sem CORS liberado (mesma origem) |
| Dependências | `pnpm audit` no CI; lockfile commitado |

Fica explícito no README que senha qualquer é requisito do desafio, não prática de produção.

### 5.3 Manutenibilidade e reuso
- **Regras de negócio num lugar só** (`packages/domain`): o tickets-service calcula vencimento com a mesma função que o agent usa para explicar o prazo, sem lógica duplicada.
- **Contratos compartilhados** (`packages/contracts`): o mesmo schema Zod valida no servidor e tipa o cliente, então mudar um DTO quebra a compilação em vez de quebrar em produção.
- **Porta `TicketGateway`:** trocar o simulado por um sistema de chamados real é escrever outro adapter. O agent e os casos de uso não mudam.
- **Tools como wrappers finos:** a lógica fica em `app/`, reaproveitada pelas tools e pelos endpoints (ex.: confirmar rascunho pelo botão usa o mesmo caso de uso).
- **UI reutilizável:** `TicketCard`, `StatusPill`, `PriorityBadge`, `ActionChips` servem ao chat e ao console. Tokens do `.pen` viram tema do Tailwind, sem cor hardcoded.
- **Erros tipados:** `AppError` com `code` (`TICKET_NOT_FOUND`, `TICKETS_UNAVAILABLE`, `FORBIDDEN`...) traduzido para HTTP num único middleware. O front tem um mapa de código → mensagem amigável.
- **Prompt e regras versionados em arquivos**, com a avaliação roteirizada como teste de regressão do comportamento do agent.
- **Contrapeso:** nada de abstração especulativa. Porta só onde existe troca real ou necessidade de fake em teste (tickets, KB, relógio, repositórios).

### Como o agent decide (núcleo do desafio)
Princípio: **o LLM interpreta, o código garante as regras.**
- O LLM (agent Mastra com tools) identifica a intenção e extrai campos (tipo, categoria, impacto, urgência, resumo).
- Regras determinísticas em código puro e testado: matriz de prioridade (RN11), SLA/vencimento em horário útil (RN12/13), janela de reabertura (RN06), candidatos a duplicidade (RN05).
- **Turno em duas etapas (R05):** classificador com saída estruturada (intenção, campos, confiança, porquê) → agent com tools, que recebe a classificação como contexto do sistema (`apps/api/src/agent/classifier.ts`). Ao fim do turno, `decision-trace.ts` junta a classificação, os passos do agent, as regras que o código aplicou e os sinais que reduziram a confiança; o registro fica em `decision_traces`, ligado à mensagem. O limiar (R39) é decidido antes do agent falar: segunda mensagem seguida com confiança baixa vai para um analista sem chamar o agent.
- **Confirmação validada pelo código (RN04, R04):** o agent propõe o rascunho. A criação ou atualização só acontece pelo caso de uso `confirmDraft`, chamado pelo botão, pelo Ctrl/⌘+Enter ou pela tool `confirm_draft`. O servidor recusa se as condições de R04 não forem atendidas.
- **Pausa por construção (RN08):** se a conversa está com analista, o servidor nem chama o LLM.
- **Privacidade por construção (RN09):** o `userId` vem da sessão, injetado no contexto das tools; nenhuma tool aceita `userId` do modelo.
- Tools (cada uma gera um chip em português e um passo de trace): `search_knowledge_base` ("buscou na central de ajuda"), `list_my_tickets` ("consultou seus chamados"), `get_ticket` ("consultou o INC-x"), `classify_priority` ("classificou a prioridade"), `compute_deadline` ("consultou o SLA"), `propose_draft` ("montou o rascunho"), `propose_update`, `confirm_draft`, `ask_with_options`, `handoff_to_analyst` ("chamou um analista").
- Cada turno gera um **registro de decisão**: classificação da etapa 1 (intenção entendida, confiança, porquê) + ações da etapa 2 (tools chamadas, regras aplicadas, resultado). Persistido e exibido ao expandir os chips. Confiança ajustada por sinais determinísticos (R09) abaixo do limiar calibrado → transferência "agent pediu ajuda".
- Custo: modelo barato e rápido, prompt de sistema curto, histórico em janela + resumo, KB pequena com busca por palavras-chave (sem embeddings).

## 11. Especificação de backend

### 11.1 Endpoints (api)
| Método e rota | Uso | Papel |
|---|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | Sessão | público / logado |
| `GET /api/chat` | Sessão atual + histórico + resumo das anteriores | funcionário |
| `POST /api/chat/messages` | Mensagem livre (stream) **ou** ação estruturada (`{ action: "selectTicket", ticketId }`) | funcionário |
| `POST /api/chat/drafts/:id/confirm` · `/cancel` · `PATCH /api/chat/drafts/:id` | Rascunho (botões/edição) | funcionário |
| `GET /api/chat/updates?since=` | Polling de mensagens do analista e mudanças de estado | funcionário |
| `GET /api/console/conversations?filter=&q=` | Lista com contagens por filtro | analista |
| `GET /api/console/conversations/:id` | Histórico + traces + resumo da transferência | analista |
| `POST /api/console/conversations/:id/assume` · `/release` · `/close` · `/messages` | Assumir, devolver, encerrar, responder | analista |
| `GET /api/console/employees/:id/tickets` | Painel de chamados | analista |
| `GET /api/stats` · `GET /api/health` | Números do login · health check | público |

### 11.2 tickets-service (interno, com token)
`GET /tickets?ownerId&status` · `GET /tickets/:id?ownerId` · `POST /tickets` (`Idempotency-Key`) · `POST /tickets/:id/updates` (`Idempotency-Key`) · `POST /tickets/:id/reopen` · `POST /tickets/:id/transfer`. Numeração sequencial por tipo (INC-205xx, REQ-104xx). Middleware de falha configurável por env (`FAILURE_RATE`, `FAILURE_LATENCY_MS`).

### 11.3 Máquinas de estado (explícitas, testadas, num arquivo cada)
- **Conversa:** `agent` → `waiting_analyst` (transferência) → `analyst` (assumir) → `agent` (devolver) | `closed` (encerrar). `waiting_analyst` → `agent` (devolver sem assumir). Transição inválida = erro tipado. A tabela fica em `apps/api/src/app/conversation-state.ts`, e a troca no banco só passa se a versão lida for a atual (R06). Cada transferência grava uma linha em `handoffs`, com o resumo do agent, o nível (A03) e o prazo de contato (A02).
- **Chamado:** `new` → `in_progress` | `waiting_analyst` → `in_service` (analista assumiu) → `resolved` → `reopened` (≤ 7 dias). REQ: `new` → `approved` → `in_progress` → `resolved`. `cancelled` a partir de qualquer estado aberto.
- **Rascunho:** `pending` → `confirming` → `confirmed`; `pending` → `cancelled`. Cada transição é um UPDATE condicional ao status esperado, então duas ações simultâneas não passam as duas. Se a escrita no sistema de chamados falha, `confirming` → `confirm_failed`: o chamado pode ter sido criado, então o rascunho congela e só aceita confirmar de novo, com a mesma chave. Pelo chat (R04), só confirma rascunho desta conversa visto antes da mensagem: `shown_at` é gravado quando uma resposta concluída do agent mostra o `D-n`, ou quando o funcionário edita no card. Propor outro rascunho cancela o pendente da conversa.
- **Sessão:** `active` → `ended` (30 mensagens ao agent e o funcionário pede uma nova; 8 h inativa, **exceto** com a conversa em `waiting_analyst`/`analyst`; ou "Nova sessão"). É um trecho da mesma conversa (`chat_sessions`); ao encerrar, grava um resumo montado pelo código, que abre a sessão seguinte. O agent recebe só as mensagens da sessão atual, mais o resumo e os rascunhos pendentes no contexto de sistema.

### 11.4 Modelo de dados (resumo)
- **api.db:** `users` (nome, e-mail, papel, setor, nível N1/N2), `auth_sessions`, `conversations` (estado, `version`, analista), `chat_sessions` (contador, resumo, status), `messages` (autor: employee/agent/analyst/system; partes: texto/cards), `decision_traces` (por turno: classificação, passos, regras, confiança, sinais, tokens, latência), `drafts`, `conversation_tickets` (painel "Desta conversa"), `rate_limits`.
- **tickets.db:** `tickets`, `ticket_updates` (autor: equipe/funcionário; define o prazo, A17), `idempotency_keys`.
- **Central de ajuda:** artigos em **arquivos Markdown versionados** (`apps/api/knowledge/*.md` com frontmatter: título, tags, aplica-se a), carregados no boot. Legíveis e revisáveis em PR.

### 11.5 Ações estruturadas: caminho determinístico × caminho LLM
Cliques em opções (selecionar chamado, Confirmar, Cancelar, "Falar com um analista", "Não, obrigado") enviam um **payload estruturado** e são tratados por handlers determinísticos: **sem chamada ao LLM**. O trace registra "ação determinística, confiança 100%". A resposta vem de um template (ex.: o card do chamado + "Está sem atualização há 5 dias..."). Texto livre segue o caminho classificador → agent. Vantagens: mais barato, mais rápido, testável e sem risco de o LLM interpretar errado um clique.

### 11.6 Requisitos não funcionais do backend
| Tema | Meta / regra |
|---|---|
| Latência | Primeiro token < 3 s (p50) em texto livre; ações determinísticas < 300 ms. Medido e gravado no trace |
| Custo | Tokens por turno gravados no trace; custo médio por conversa estimado no README; prompt caching; histórico em janela |
| Resiliência do legado | Timeout 2 s por tentativa, 3 tentativas com backoff exponencial + jitter, só com idempotência; depois, erro tipado e degradação honesta |
| Resiliência do LLM | Timeout de 30 s; em falha, mensagem de erro + oferta de analista; nunca deixar o turno "pendurado" (turno marcado `failed`) |
| Persistência | Migrações Drizzle versionadas, aplicadas no boot; WAL do SQLite ligado |
| Observabilidade | Logs estruturados (pino) com `requestId`, `conversationId`, `turnId`; nunca segredos; conteúdo de mensagem só em debug |
| Segurança | Seção 5.2 |
| Operação | `GET /api/health` (checa banco e tickets-service), desligamento gracioso, Node fixado (`.nvmrc` + `engines`), pnpm via corepack |
| Portabilidade | Scripts cross-platform (o dev é no Windows): nada de `rm -rf`/`export` em scripts; usar `rimraf`/`cross-env` |

