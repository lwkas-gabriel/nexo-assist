# Nexo Assist — Plano

> **Mapa da documentação.** As seções mantêm a numeração do plano original para que as referências cruzadas (ex.: "ver 10.6", "R03", "A12") continuem válidas:
> [PLAN.md](PLAN.md) — seções 1–4, 6–8 e 12 (requisitos, suposições, tarefas) ·
> [ARCHITECTURE.md](ARCHITECTURE.md) — seções 5 e 11 (arquitetura, segurança, backend) ·
> [FRONTEND.md](FRONTEND.md) — seção 10 (telas, componentes, responsividade) ·
> [REVIEW.md](REVIEW.md) — seção 9 (revisões adversariais R01–R47) ·
> [AI_LOG.md](AI_LOG.md) — registro do uso de IA

**Status:** Fase 1 concluída (29/10/2026). Fase 2 concluída: T01, T02 e T02b (deploy adiado para a T29 por decisão do usuário). Fase 3 em andamento: T03 a T16 concluídas; próxima T17 (design tokens e componentes base). Modelo: Gemini no plano gratuito (ADR-0010).

## Contexto
Desafio técnico (vaga fullstack, desenvolvimento assistido por IA é avaliado). Construir o **Nexo Assist**: chat de service desk de TI com agent (Mastra), serviço de chamados simulado e console do analista, seguindo o protótipo `nexo.pen`. Entregáveis: repositório, deploy, comandos, README.
Fontes: `Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` (PRD + Anexos A/B/C) e o protótipo `nexo.pen` (6 telas + tokens de design, aberto no Pencil). Por serem material fornecido pela empresa, **não estão versionados** neste repositório; todo o conteúdo relevante deles foi transcrito nestes documentos.

### Decisões tomadas com o usuário
- **Stack:** React + Vite (web) · Hono + Mastra (api) · tickets-service separado · SQLite. **Deploy no Railway.**
- **LLM:** **Gemini no plano gratuito do Google** (`gemini-3.5-flash-lite`, configurável), pelo roteador de modelos do Mastra ([ADR-0010](decisions/0010-gemini-plano-gratuito.md)). Troca feita em 30/10/2026, substituindo o Claude Haiku ([ADR-0008](decisions/0008-modelo-claude-haiku.md)):
  - **Por quê:** é um desafio técnico, sem orçamento; o dono do projeto decidiu não gastar nada com o modelo. O PRD aceita qualquer provedor, e o plano gratuito do Gemini não exige cartão e suporta tools e saída estruturada.
  - **O que mudou:** só a config (`LLM_MODE=gemini`, `GEMINI_API_KEY`, `LLM_MODEL`) e a criação do modelo; o agent, as tools e o modo `mock` não mudaram. Os tetos globais de mensagens passaram para o `.env`, calibrados pela cota gratuita conferida no AI Studio (15 req/min e 500 req/dia): 5 mensagens por minuto e 150 por dia.
  - **Cuidados:** no plano gratuito, o Google pode usar o conteúdo para melhorar os produtos dele (aceitável, porque os dados são fictícios); há cota por minuto e por dia, e a cota esgotada vira um aviso claro ao funcionário.
  - **Achado na troca:** o erro bruto do provedor (mensagem e stack trace) chegava ao navegador; foi corrigido para qualquer provedor.
- **Prazo:** sem prazo fixo → plano completo (T01–T29), incluindo "Meu perfil" e avaliação roteirizada.
- **Branches:** trabalho sempre na `develop`, nunca direto na `main`. A `main` só recebe merge da `develop` (via PR) quando você decidir. O CI roda em push/PR para `develop` e `main`; o deploy contínuo do Railway sai da `main`, então a produção só muda quando você promover a `develop`. Também vira regra no CLAUDE.md.
- **Segredos:** nenhuma chave ou variável de ambiente exposta no código (detalhes em 5.2). Vira regra no CLAUDE.md, com verificação no CI (gitleaks + lint).
- **Commits/PRs:** sem trailer `Co-Authored-By` nem assinatura da IA. Vira regra explícita na seção "O que nunca fazer" do CLAUDE.md. O uso de IA fica documentado no AI_LOG.md e no README, não nos commits.
- **Idioma:** documentos (README, PLAN, AI_LOG, CLAUDE.md), textos da UI e mensagens de commit em português. **Identificadores de código em inglês** (decidido), com glossário PT↔EN no CLAUDE.md (chamado = ticket, rascunho = draft, transferência = handoff, central de ajuda = knowledge base, analista = analyst...). Nomes de tools do agent em inglês também (`search_knowledge_base`, `propose_draft`...).
- **Responsividade:** chat do funcionário totalmente usável no celular; console otimizado para ≥ 1024 px e funcional no celular, uma coluna por vez (10.6).

## 1. Requisitos funcionais (RF)

| ID | Requisito | Origem |
|---|---|---|
| RF01 | Login com e-mail corporativo + qualquer senha, para usuários dos dados de exemplo | PRD §O que construir 1, Tela 1 |
| RF02 | Logout e sessão persistente | Tela 1/2 ("Sair", "Manter conectado") |
| RF03 | Chat do funcionário com respostas em tempo real (streaming) | PRD 2 |
| RF04 | Chips de ação acima de cada resposta ("consultou seus chamados", "classificou a prioridade") | PRD 7, Telas 2/3 |
| RF05 | **Detalhe da decisão** por resposta: o que entendeu, ação tomada, grau de confiança, porquê (a parte mais importante) | PRD 7 |
| RF06 | Pergunta com opções rápidas (botões numerados) | PRD 2, Tela 2 |
| RF07 | Card de rascunho de chamado com Confirmar / Editar / Cancelar | PRD 2, Tela 2 |
| RF08 | Seleção entre chamados do funcionário (cards clicáveis) | PRD 2, Tela 3 |
| RF09 | Card de chamado com status, prioridade, última atualização e "prazo vencido" | Tela 3 |
| RF10 | Contador e limite de 30 mensagens por sessão | PRD 2, Telas 2/3 |
| RF11 | Retomar a conversa outro dia de onde parou | História func. 6 |
| RF12 | Tirar dúvida pela central de ajuda sem abrir chamado | História func. 1 |
| RF13 | Consultar chamado sem lembrar o número e saber se está atrasado | História func. 2 |
| RF14 | Complementar chamado aberto (com confirmação) | História func. 3 |
| RF15 | Abrir chamado conversando, conferindo rascunho | História func. 4 |
| RF16 | Transferir para analista com resumo do caso | História func. 5, PRD 5 |
| RF17 | Agent pausado enquanto a conversa está com analista | PRD 5 |
| RF18 | Console: lista de conversas com filtros (Todas / Para você / Com o agent / Minhas), status e busca | PRD 6, Tela 4 |
| RF19 | Console: histórico da conversa, incluindo casos "agent pediu ajuda · confiança X%" | História analista 2, Tela 4 |
| RF20 | Console: assumir (agent pausado), responder, devolver ao agent, encerrar | História analista 3, Telas 4/5 |
| RF21 | Console: painel "Chamados do funcionário" (desta conversa + outros) | PRD 6, Telas 4/5 |
| RF22 | Serviço de chamados simulado, separado do agent: consultar, criar, atualizar, reabrir, transferir | PRD 4 |
| RF23 | Estados de carregamento e erro na UI | Critério "Interface" |
| RF24 | Tela "Meu perfil" (**só no mock, não no PRD** — ver A01) | `nexo.pen` |

## 2. Regras de negócio (RN) — Anexo A

| ID | Regra |
|---|---|
| RN01 | Tipo: INC (algo parou/não funciona) ou REQ (pedido de acesso, equipamento, software) |
| RN02 | Categorias fixas: Acesso, Rede e VPN, Hardware, Software, E-mail, Outros |
| RN03 | Chamado exige título, descrição, tipo, categoria, prioridade, afetados |
| RN04 | Criar/atualizar só após confirmação explícita do funcionário sobre um rascunho |
| RN05 | Sem duplicidade: se há chamado aberto sobre o mesmo problema, atualiza |
| RN06 | Chamado resolvido há ≤ 7 dias pode ser reaberto (> 7 dias → novo chamado) |
| RN07 | Transferência quando: funcionário pede, caso crítico, chamado vencido, agent sem segurança. Leva resumo |
| RN08 | Agent não responde enquanto a conversa está com analista |
| RN09 | Informação de chamado só para quem o abriu |
| RN10 | Escopo só TI; RH, financeiro, facilities são redirecionados |
| RN11 | Prioridade = impacto (quantos afetados) × urgência (compromisso em risco) |
| RN12 | SLA: Crítica 1 h · Alta 4 h úteis · Média 3 dias úteis · Baixa 5 dias úteis; vale para 1ª resposta e cada atualização; passou → vencido |
| RN13 | Horário útil: seg–sex, 8h–18h (do artigo de exemplo); críticos têm plantão 24 h |
| RN14 | Limite de 30 mensagens por sessão |

## 3. Requisitos técnicos obrigatórios (RT)

| ID | Requisito |
|---|---|
| RT01 | TypeScript com `strict` |
| RT02 | Mastra (preferência) ou LangGraph.js |
| RT03 | Qualquer LLM, com justificativa no README |
| RT04 | UI fiel ao protótipo (layout e estilo) |
| RT05 | Serviço de chamados simulado separado do agent; legado com indisponibilidade de alguns segundos |
| RT06 | Persistência de conversas, chamados e estado (agent/analista) sobrevivendo a reinício |
| RT07 | Rodar local com poucos comandos + `.env.example` |
| RT08 | Separação interface / agent / serviços, decisões justificadas |
| RT09 | Testes onde fazem diferença, tratamento de erros, commits que contam a história |
| RT10 | Eficiência: latência e custo por conversa |
| RT11 | Chaves fora do código; isolamento entre funcionários |
| RT12 | README: como rodar, arquitetura, como o agent decide, como garantiu qualidade, trade-offs, o que faria com mais tempo |
| RT13 | (Diferencial) Deploy com chaves protegidas e limite de uso, explicado no README |

## 4. Ambiguidades e contradições mock × PRD

| ID | Ponto | Pergunta ao recrutador | Suposição padrão |
|---|---|---|---|
| A01 | Mock tem 6ª tela "Meu perfil" com "Redefinir senha", fora do PRD | Ela faz parte do escopo? | Implementar só leitura; "Redefinir senha" mostra aviso de simulação |
| A02 | Mock: transferência diz "analista fala em até **2 h úteis**" e "Agent pausado · até 12:05"; nenhum prazo de 2 h existe no Anexo A | Qual o prazo de atendimento após transferência? | Crítico: 1 h (o SLA da prioridade). Os demais, com ou sem chamado vinculado: 4 h úteis (o SLA de Alta). *Revisto na T13:* usar o SLA de qualquer prioridade fazia um chamado médio já vencido esperar mais 3 dias úteis depois de transferido |
| A03 | Suporte N1 vs N2: mock transfere para N2, PRD não diz como escolher | Há regra de roteamento N1/N2? | Vencido, crítico ou baixa confiança → N2; pedido simples → N1. Decidido pelo chamado ligado, não só pelo motivo que o agent registra (T13) |
| A04 | Anexo A diz que chamado vencido **gera** transferência; o mock mostra o agent **oferecendo** | Transferir automático ou oferecer? | Oferecer (como no mock); crítico transfere direto, avisando |
| A05 | "Sessão" no limite de 30 mensagens: login, dia ou conversa? Contam mensagens do funcionário ou todas? | Definição de sessão | Conta só mensagens do funcionário; sessão termina em 30 mensagens ou 8 h de inatividade; a nova sessão herda histórico, resumo e pendências (ver R03) |
| A06 | Matriz impacto × urgência incompleta (ex.: equipe afetada mas com alternativa) | Tabela completa? | Matriz explícita no código (ver §6) e testada; casos de fronteira subindo um nível |
| A07 | Como o analista faz login? PRD só fala de funcionários | Mesmo login com papel? | Mesmo login; analistas no seed (ex.: Rafael Lima, N2) redirecionados ao console |
| A08 | "Encerrar atendimento" resolve o chamado? | Encerrar conversa ≠ resolver chamado? | Encerra só a conversa; chamado segue seu próprio status |
| A09 | Mock mostra subcategoria ("Hardware › Notebook"), PRD só tem 6 categorias | Subcategoria é necessária? | Subcategoria livre opcional; validação só na categoria |
| A10 | Feriados no cálculo de dias úteis | Considerar feriados? | Ignorar feriados (documentado) |
| A11 | Números da tela de login (8 s, 72%, 6 analistas) | Reais ou ilustrativos? | Calcular a partir do banco quando barato; senão marcar como ilustrativo |
| A12 | "Aprovado" (REQ-10442) conta como aberto? Mock lista como aberto | Lista de status? | Abertos: Novo, Em andamento, Aguardando analista, Aprovado, Em atendimento (quando o analista assume, tela 5), Reaberto. Fechados: Resolvido, Cancelado. Transições em 11.3 |
| A13 | Deploy público + "qualquer senha" = qualquer um gasta tokens | Ok expor assim? | Rate limit por usuário/IP + teto diário global; com o Gemini no plano gratuito (ADR-0010), não há gasto possível: o pior caso é a cota acabar e o funcionário ver um aviso |
| A15 | RN09 diz que só quem abriu vê o chamado, mas o console mostra ao analista os chamados do funcionário | Analistas são exceção à RN09? | Sim: a RN09 vale entre funcionários; papel `analyst` vê chamados de quem está no console, e o acesso fica registrado |
| A16 | Duplicidade entre funcionários diferentes (pane coletiva) | Verificar duplicidade fora do próprio funcionário? | Só entre chamados do próprio funcionário; pane coletiva → impacto equipe/empresa → Crítica → transferência (R14) |
| A17 | O que conta como "atualização" que zera o prazo | Complemento do funcionário zera o SLA? | Não: conta a última atualização da equipe de TI, ou a abertura (R15) |
| A18 | Mock só desktop (1440 px, 6 frames "desktop", larguras fixas) | Precisa ser responsivo? Há layout mobile esperado? | Desktop fiel ao mock; tablet e celular adaptados por nós (ver 10.6). Chat do funcionário totalmente usável no celular; console priorizado para ≥ 1024 px, mas funcional no celular |
| A19 | Card de rascunho do mock omite o Tipo (INC/REQ) | Pode exibir o Tipo no card? | Sim, a RN03 exige; exibido junto dos demais campos |
| A20 | Mock mostra ✓✓, "digitando…" e "online" | São requisitos ou ilustração? | online por polling, ✓/✓✓ simples; "digitando…" fora do escopo |
| A21 | "Disponível" do analista | Afeta o roteamento? | Só visual (preferência salva) |
| A22 | Avaliador precisa saber as contas de demo | Pode exibir na tela de login? | Bloco discreto "Contas de demonstração", rotulado |
| A23 | Protótipo oferece "Não sei" na pergunta "Quem está sendo afetado?", mas a RN03 exige esse campo | O que fazer quando o funcionário não sabe quem é afetado? | "Não sei" não é um valor válido: o agent faz uma pergunta mais concreta (ex.: "seus colegas também estão sem acesso?"); se continuar sem resposta, assume "só eu" e explica no rascunho, que o funcionário confere antes de confirmar |
| A24 | "3 dias úteis" e "5 dias úteis" (RN12) podem ser lidos como dias de calendário úteis ou como horas de expediente | Como contar prazos em dias úteis? | N dias úteis = N × 10 h de expediente (8h–18h). Na prática, vence no mesmo horário N dias úteis depois (aberto segunda 10h, prazo de 3 dias úteis vence quinta 10h); um único algoritmo cobre horas e dias |
| A14 | Dados do mock (INC-20311 "há 5 dias") divergem do Anexo B ("há 6 dias") | — | Dados do mock são ilustrativos (o próprio PDF diz); seed com datas relativas a "agora" |

## 6. Matriz de prioridade proposta (RN11, A06)

| Impacto \ Urgência | Parado, sem alternativa | Compromisso hoje | Atrapalha, há alternativa | Pedido sem urgência |
|---|---|---|---|---|
| Empresa / equipe | Crítica | Crítica | Alta | Média |
| Só eu | Alta | Alta | Média | Baixa |

## 7. Tarefas (ordenadas, uma tela ou regra por tarefa)

**Fase 2 — Setup**
- [x] T01 Monorepo (apps/web, apps/api, apps/tickets-service, packages/shared), config Zod por app, TS strict, ESLint, Prettier, Vitest, Playwright, CLAUDE.md (com as convenções de legibilidade da seção 12), AI_LOG.md, esqueleto do README, ADRs iniciais em `docs/decisions/`, scripts cross-platform, `.nvmrc` (RT01, RT07, RT09, RT12, R47) — **concluída** (`47913d2`…`3eb3526`). Desvios: TypeScript fixado na 6.0 e servidores rodando TS nativo no Node 24, sem build (ADR-0004); pastas `domain/` e `contracts/` do shared nascem na T03, junto com o código.
- [x] T02 CI GitHub Actions (lint, test, build, gitleaks, `pnpm audit`) + hook de pre-commit com gitleaks + configuração de deploy contínuo (RT11, RT13) — **concluída** (`5271242`…`bfe8340`; CI verde no run 40960579079). Desvio: a configuração de deploy contínuo foi para a T02b, que é quando existe algo para publicar (a api servindo o front).
- [x] T02b **Esqueleto ponta a ponta + deploy:** login fake → chat → agent com 1 tool → streaming (protocolo de UI do AI SDK) → chip → deploy no Railway; versões do Mastra/AI SDK fixadas (R07, R10, R25) — **concluída** (`ebd1662`…`ad7ea99`; CI verde; testada manualmente pelo usuário). **Deploy adiado para a T29** por decisão do usuário (custo do Railway e da API); `railway.json` e proteções contra abuso já prontos. Desvios: sem "login fake" (a autenticação real é a T10, evitando código descartável); limite de mensagens por IP e teto diário antecipados da T16, porque o deploy é público.

**Fase 3 — Domínio e serviços**
- [x] T03 Domínio puro: tipos, categorias, status, campos obrigatórios (RN01–RN03, A12) — **concluída** (`a267294`, `7b56f01`). Inclui leitura do número do chamado escrito pelo funcionário e a lista ordenada do que falta no rascunho; nova suposição A23 ("Não sei").
- [x] T04 Calendário útil + SLA + vencimento (RN12, RN13, A10) — **concluída** (`b1826d0` e seguinte). Calendário configurável testado também com virada de horário de verão; nova suposição A24 (dias úteis = 10 h de expediente cada).
- [x] T05 Matriz de prioridade (RN11, A06) — **concluída**. A função devolve a prioridade e a justificativa ("RN11: somente você + compromisso hoje → Alta"), que vai para o registro de decisão.
- [x] T06 Reabertura ≤ 7 dias + candidatos a duplicidade (RN05, RN06) — **concluída**. O código aponta candidatos (com ação "atualizar" ou "reabrir"); quem confirma que é o mesmo problema é o agent, com o funcionário. Normalização de texto movida para o domínio e reutilizada pela central de ajuda.
- [x] T07 Tickets-service: schema, seed (funcionários, analistas, 5–10 artigos, chamados variados), REST validado por `packages/contracts`, isolamento por dono na query, token de serviço (RF22, RN09, RT05, RT11) — **concluída**. Migrações em SQL puro (ADR-0009); token gerado localmente pelo `pnpm setup:env`; 10 chamados de demonstração com datas relativas, com testes provando os cenários em qualquer dia da semana; 8 artigos na central de ajuda.
- [x] T08 Injeção de falhas no tickets-service + adapter `TicketGateway` com timeout, retry/backoff e erro tipado `TICKETS_UNAVAILABLE` (RT05, RT09) — **concluída**. Falha simulada antes e depois de gravar; idempotência obrigatória em todo POST; teste prova que falha depois de gravar + retry = um único chamado. Desvio: sem latência simulada (`FAILURE_LATENCY_MS`), o timeout é coberto nos testes do gateway.
- [x] T09 API: persistência de conversas, mensagens, estado e traces (RT06, RF11) — **concluída** junto com a T10 (as conversas pertencem ao funcionário logado). Histórico no banco, o navegador manda só o texto novo; um turno por conversa (R06); teste de reinício (RT06). A coluna `version` existe; o uso dela entra nas trocas de estado da T13.
- [x] T10 API: auth por sessão (cookie seguro), middleware de papel, checagem de Origin, secureHeaders, middleware de erros tipados (RF01, RF02, A07, A15, RT11) — **concluída**. Login com tela funcional mínima no front (o visual é a T18); limite de tentativas de login; CSRF por checagem de Origin.
- [x] T10b Testes de segurança: funcionário A não acessa chamado/conversa de B; funcionário não acessa console; tickets-service recusa chamada sem token (RN09, RT11) — **concluída** (`apps/api/src/security.test.ts`). Para testar o acesso ao console, a primeira rota dele (lista de conversas) foi antecipada da T23.

**Fase 3 — Agent**
- [x] T11 Agent Mastra: prompt, tools de leitura (KB, meus chamados, chamado), escopo TI (RF12, RF13, RN10). Ajuste do prompt com o Gemini no plano gratuito (cota já conferida e tetos calibrados, ADR-0010) — **concluída**. Tools list_my_tickets e get_ticket com o funcionário vindo da sessão (falha fechada); prazo e datas calculados pelo domínio; prompt validado com o Gemini real (listar e perguntar qual, prazo vencido, recusa de chamado alheio, redirecionamento para o RH). Revisão adversarial independente: 9 achados (1 importante), todos corrigidos (AI_LOG 40).
- [x] T12 Tools de proposta: rascunho, atualização, opções rápidas; endpoint de confirmação (RF06, RF07, RF14, RF15, RN04, RN05) — **concluída**. Caso de uso único para tools e botões; confirmação pelo chat validada pelo servidor (R04: rascunho desta conversa, pendente e mostrado antes do turno); chave de idempotência por rascunho (R01); botões confirmar/cancelar/editar sem LLM, registrados na conversa; prompt validado com o Gemini real (AI_LOG 41–42). Revisão adversarial independente: 9 achados (1 crítico: confirmações simultâneas duplicavam o chamado), todos corrigidos (AI_LOG 43). O card visual do rascunho fica na T19.
- [x] T13 Transferência + pausa + resumo + confiança/limiar (RF16, RF17, RN07, RN08) — **concluída**. Tool `handoff_to_analyst` com resumo do agent (R17); nível (A03) e prazo de contato (A02, revista) calculados pelo código a partir do chamado ligado; troca de estado da conversa condicionada à versão (R06); agent pausado fora do modo agent (RN08); chamado crítico confirmado transfere sozinho (A04); histórico do agent com mensagens do analista marcadas (R18); prompt validado com o Gemini real (AI_LOG 44). Revisão adversarial independente: 11 achados (1 crítico: caso crítico sem chamado esperava 4 h úteis), todos tratados (AI_LOG 45). **Desvio:** o limiar numérico de confiança depende do classificador e entra na T14; aqui, a baixa confiança é decidida pelo agent, que pergunta antes de transferir (R39). As rotas do console para assumir, devolver e encerrar ficam na T24, que é onde a tela delas nasce.
- [x] T14 Classificador estruturado (etapa 1) + registro de decisão por turno + confiança ajustada por sinais (RF04, RF05, R05, R09) — **concluída**. Classificador com saída estruturada antes do agent; se falhar, o turno segue com confiança neutra. O agent recebe a classificação como contexto do sistema. Ao fim do turno, o registro (o que entendeu, passos, regras aplicadas, sinais e confiança final) é gravado e vai para a tela nos metadados da mensagem. Limiar 0,5 (R39): com confiança baixa o agent pergunta; na segunda mensagem seguida com o classificador em confiança baixa, no mesmo período com o agent, o código transfere antes do agent falar. Validado com o Gemini real (AI_LOG 46). Revisão adversarial independente: 9 achados, todos tratados (AI_LOG 47); entre eles, os tetos de uso recalculados para 3 mensagens por minuto e 120 por dia, e o limiar passou a comparar a confiança do classificador nas duas mensagens. Os tokens do agent (etapa 2) ainda não são medidos: só os do classificador e a latência do turno; fica para a T16. O limiar será calibrado na avaliação da T27.
- [x] T15 Sessões: limite de 30 mensagens, fim por inatividade, resumo e herança de pendências na nova sessão (RF10, RF11, RN14, A05, R03) — **concluída**. Sessão como trecho da mesma conversa (tabela `chat_sessions`): contagem atômica só das mensagens ao agent (R42); a 31ª é recusada antes do modelo, com o código `SESSION_LIMIT`; fim por 8 h de inatividade com o agent (R41); "Nova sessão" por `POST /api/chat/sessions`. O resumo é montado pelo código ao encerrar (assuntos entendidos e linhas de sistema), sem chamar o modelo. O agent vê só a sessão atual, com o resumo e os rascunhos pendentes no contexto (R03). Validado com o Gemini real (AI_LOG 48). Revisão adversarial independente: 12 achados (1 crítico: texto do funcionário de volta ao contexto de sistema do agent), todos tratados (AI_LOG 49); entrou também o "Falar com um analista" pelo botão (`POST /api/chat/handoff`). O composer bloqueado e o card do resumo são da T19.
- [x] T16 Rate limit e teto de custo (RT10, RT13, A13) — **concluída**. Além dos limites que já existiam (por funcionário, tetos globais calibrados pela cota, login por IP, mensagens ao analista e botões), entrou o limite de 60 mensagens ao agent por IP por hora (A13: qualquer senha entra, então uma pessoa poderia usar todas as contas). Cada turno passou a gravar os tokens do agent, além dos do classificador, e o comando `usage:report` resume custo e latência por turno e por conversa. Medição real com o Gemini: cerca de 10,7 mil tokens por turno, 32 mil por conversa, latência p50 de 3,8 s (AI_LOG 50). **Decisão:** sem teto de tokens; no plano gratuito o limite que importa é o de requisições, já coberto pelos tetos globais.

**Fase 3 — Interface**
- [ ] T17 Design tokens (10.1), `statusStyles` (10.2), componentes base, `SidePanel` e breakpoints (10.6) (RT04, A18)
- [ ] T18 Tela 1 Login (RF01, A11)
- [ ] T19 Tela 2 chat: streaming, chips progressivos, opções rápidas (teclas 1–4), DraftCard com Tipo e estados criado/cancelado, Ctrl/⌘+Enter (RF03, RF04, RF06, RF07, R26, R33–R35)
- [ ] T19b Ações estruturadas: handlers determinísticos para cliques (R38, 11.5)
- [ ] T20 DecisionPanel (painel lateral / gaveta / bottom sheet) (RF05, 10.4)
- [ ] T21 Tela 3: seleção de chamado, card com prazo vencido, oferta de analista (RF08, RF09, RF13)
- [ ] T22 Estados "transferida", "com analista" e "encerrada" no chat do funcionário (RF17, R27)
- [ ] T23 Tela 4 console: lista, filtros com contagem, busca, conversa transferida com chips e DecisionPanel, painel de chamados expansível, online/✓✓ (RF18, RF19, RF21, R28–R30, R32, R36)
- [ ] T24 Tela 5: assumir, responder, devolver, encerrar (RF20, A08)
- [ ] T25 Meu perfil (RF24, se A01 confirmar)
- [ ] T26 Estados de carregamento, erro e vazio (10.5) em todas as telas (RF23)
- [ ] T26b Revisão de responsividade e acessibilidade nos 4 breakpoints (10.6, 10.7)

**Fase 3 — Qualidade**
- [ ] T27 Avaliação do agent: conjunto de ~15 conversas roteirizadas (dúvida, fora de escopo, duplicidade, vencido, crítico, privacidade) checando a ação escolhida (critério "qualidade das decisões")
- [ ] T28 E2E Playwright: (1) abrir chamado com rascunho e confirmação; (2) transferência → analista assume → devolve (LLM mockado no E2E)

**Fase 4**
- [ ] T29 Revisão final do README + seção de IA a partir do AI_LOG.md + **deploy no Railway** (adiado da T02b: projeto, variáveis, domínio e link no README) com o Gemini no plano gratuito

## 7.1 README (em português), foco em **como rodar** e **principais decisões**
O esqueleto nasce na T01 e é atualizado a cada tarefa que mude como rodar ou alguma decisão. Assim ele nunca fica para o fim.
1. **O que é** + link do deploy.
2. **Como rodar:** pré-requisitos (Node, pnpm), `.env.example` explicado variável por variável e comandos: `install`, `db:seed`, `dev`, `test`, `test:e2e`, `eval`, `build`. Usuários de exemplo para login (funcionários e analista).
3. **Principais decisões, com o porquê de cada uma:**
   - Arquitetura: web / api+agent / tickets-service, com diagrama simples.
   - Por que Vite + Hono, por que SQLite e por que Railway.
   - Por que Gemini no plano gratuito: custo zero, tools e saída estruturada; e as limitações de cota e de uso dos dados (ADR-0010).
   - Como o agent decide: o LLM interpreta e o código garante as regras (confirmação, pausa e privacidade garantidas pela estrutura).
   - Como funciona a transparência (registro de decisão e confiança).
   - Como garanti a qualidade das decisões: testes de regra, avaliação roteirizada e E2E.
   - Tratamento do legado instável (retry/backoff).
   - Segurança: tabela ameaça → medida (5.2), resumida.
   - Manutenibilidade: camadas, pacotes compartilhados, portas (5.1 e 5.3).
   - Deploy: proteção da chave e rate limit.
4. **Suposições adotadas** (A01–A18, incluindo as que surgiram na revisão adversarial).
5. **Trade-offs** e **o que faria com mais tempo**.
6. **Desenvolvimento assistido por IA:** ferramentas, como a IA foi guiada (CLAUDE.md, PLAN.md, tarefas pequenas) e exemplos reais do AI_LOG.md.
7. **Estrutura do projeto.**

## 8. Verificação
- `pnpm lint && pnpm test && pnpm build` verdes no CI a cada tarefa.
- Testes unitários nas regras (T04–T06, privacidade e confirmação).
- Avaliação roteirizada do agent (T27) rodável com `pnpm eval`.
- E2E com Playwright nos dois fluxos principais (T28).
- Teste manual: reiniciar a API no meio de uma conversa transferida e confirmar que estado, mensagens e chamados persistem (RT06).


## 12. Legibilidade: como garantir que você entende o que entregamos
- **ADRs curtos** em `docs/decisions/` (meia página cada): stack, separação api/tickets, LLM interpreta e código garante, duas etapas por turno, ações determinísticas, SQLite + Railway, sessões. Cada um com contexto, decisão, alternativas descartadas e consequências. O README aponta para eles.
- **Documentação dividida** em vez de um PLAN gigante: `docs/PLAN.md` (requisitos, suposições, tarefas), `docs/ARCHITECTURE.md` (seções 5 e 11), `docs/FRONTEND.md` (seção 10), `docs/REVIEW.md` (revisões adversariais).
- **Convenções de código no CLAUDE.md:** funções curtas, nomes descritivos, sem genéricos "espertos", comentário só para explicar o **porquê**, um conceito por arquivo, regras de negócio sempre em `packages/shared/domain` com o ID da regra no nome do teste (`it("RN06: reabre resolvido há 7 dias")`).
- **Rastreabilidade:** cada commit e cada teste cita os IDs (RF/RN/R) que atende; o PLAN.md marca a tarefa concluída com o hash do commit.
- **Ao fim de cada tarefa, eu entrego:** resumo em linguagem simples (o que mudou e por quê), arquivos tocados, como testar manualmente, sugestão de commit, e o que ficou de fora.
