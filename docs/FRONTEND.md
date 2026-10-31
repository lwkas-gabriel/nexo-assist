# Nexo Assist — Especificação de frontend

> **Mapa da documentação.** As seções mantêm a numeração do plano original para que as referências cruzadas (ex.: "ver 10.6", "R03", "A12") continuem válidas:
> [PLAN.md](PLAN.md) — seções 1–4, 6–8 e 12 (requisitos, suposições, tarefas) ·
> [ARCHITECTURE.md](ARCHITECTURE.md) — seções 5 e 11 (arquitetura, segurança, backend) ·
> [FRONTEND.md](FRONTEND.md) — seção 10 (telas, componentes, responsividade) ·
> [REVIEW.md](REVIEW.md) — seção 9 (revisões adversariais R01–R47) ·
> [AI_LOG.md](AI_LOG.md) — registro do uso de IA

## 10. Especificação de frontend (do protótipo `nexo.pen`)

### 10.1 Design system extraído
- **Fontes:** Schibsted Grotesk (UI, 10–24 px), Newsreader (títulos display 34/40/54 px no login), IBM Plex Mono (IDs de chamado, prazos). Carregadas via `@fontsource` (sem CDN externo).
- **Cores (tokens do arquivo → tema Tailwind):** `ink #1B2431` (texto principal, painel escuro), `ink-2 #3D4656`, `ink-3 #5B6472` (texto secundário, o mais usado), `paper #FFF`, `desk #F6F7F9` (fundos de área), `rule #E6E8EC` (bordas), `cta #0062C4` (botões primários), `primary #0285F7` / `primary-soft` / `primary-text`, `success*`, `warning*`, `danger*`. Fundo da conversa no console: `#EEF1F5`.
- **Raios:** 6, 8, 12, 16 e 999 (pílulas). Balões de chat com um canto de 4 px (lado de quem fala).
- **Sombras:** 3 níveis (`sm`, `card`, `cta`) copiados do arquivo.
- **Ícones:** Lucide (`lucide-react`): bot, headset, check, check-check, chevron-right, search, send-horizontal, log-out, user-round, mail, lock, key-round, rotate-ccw-key, message-square, arrow-right-left, hand, eye, x, ellipsis-vertical.
- **Implementação (T17):** os valores vêm do próprio `nexo.pen` (as variáveis do arquivo e os nós das telas) e viram o tema do Tailwind 4 em `apps/web/src/styles/tokens.css`. Os tons completos: `success #00BD6C` (suave `#00BD6C14`, texto `#00804A`), `warning #F5A500` (`#F5A50018`, `#946300`) e `danger #EE343B` (`#EE343B12`, `#C4161D`). Também entraram bordas translúcidas (`line` `#1B243117` nos cards, `line-strong` `#1B24311F` em botão secundário, campo e composer), a linha de sistema (`#1B243114`), as bolhas do console (agent `#E6EFFA`, analista `#E3F4EA`) e os 7 pares pastel dos avatares. Sombras: `sm` `0 1px 2px #1B24310D`, `card` com `0 6px 18px #1B24310A` a mais, `cta` `0 1px 2px #0062C433, 0 6px 16px #0062C426`, `bubble` `0 1px 2px #1B243112` (a mais usada), `field` e `rail`. A paleta, os raios e as sombras padrão do Tailwind foram desligados, para não existir cor fora do protótipo.
- **Layout:** desktop 1440 × 900. Chat: sidebar + área principal com mensagens em coluna central (padding lateral de 200 px). Console: rail 64 + lista 380 + conversa (flex) + painel de chamados 340.

### 10.2 Mapa de status → visual (um único arquivo, `apps/web/src/ui/status-styles.ts`)
| Status / rótulo | Cor |
|---|---|
| Aguardando analista, Aguardando atendente, Aguardando confirmação, Agent pediu ajuda · confiança X%, "há N dias" (atrasado) | warning |
| Transferida · INC-x, Transferida · contato em N min, prazo vencido, Encerrar atendimento | danger |
| Assistente online, Disponível, Suporte N2, digitando | success |
| Em andamento, Aprovado, Em atendimento, Agent atendendo, Você está atendendo | primary/neutro |
| Resolvido, Resolvida pelo agent | neutro (ink-3) |

### 10.3 Rotas e telas
| Rota | Tela | Papel |
|---|---|---|
| `/login` | Tela 1 | público |
| `/atendimento` | Telas 2 e 3 (mesma tela, estados diferentes) | funcionário |
| `/perfil` | Meu perfil | funcionário |
| `/console` e `/console/:conversaId` | Telas 4 e 5 | analista |
Guardas de rota por papel; sessão expirada → `/login` com aviso.

### 10.4 Componentes (reutilizáveis entre chat e console)
- **Base (`ui/`):** Button (primary/secondary/danger-soft/ghost), Pill/Badge, Avatar (iniciais), Card, IconButton, TextField, Checkbox, Skeleton, Toast, EmptyState, Kbd (atalho).
- **Domínio (`features/*/components`):** MessageBubble (funcionário / agent "IA" / analista com setor / sistema), ActionChips (passos do agent), **DecisionPanel** (detalhe da decisão), QuickOptions (numeradas, teclas 1–4), DraftCard (rascunho → criado/cancelado), TicketPickerList, TicketCard (com prazo e vencido), SuggestedActions ("Falar com um analista" / "Adicionar informação" / "Não, obrigado"), Composer (contador 18/30, bloqueado), ConversationListItem, FilterTabs com contagem, TakeoverBar, TicketHistoryPanel, SystemLine, DayDivider.
- **Detalhe da decisão (onde o mock é omisso):** clicar nos chips abre um **painel lateral à direita** no chat, aproveitando o espaço da coluna e o mesmo padrão do painel de chamados do console. Conteúdo: *O que entendi* (intenção + campos extraídos), *O que fiz* (cada tool, entrada resumida, resultado, fonte, ex.: artigo da KB), *Regras aplicadas* (ex.: "RN11: só eu + compromisso hoje → Alta"), *Confiança* (barra + sinais que a reduziram), *Por quê* (justificativa). **Reutilizado no console**: lá as mensagens do agent também ganham chips, porque o analista precisa entender por que recebeu a conversa.
  - **Como ficou (T20):** um botão "detalhes" no fim da linha de chips abre o painel, em vez de os próprios chips serem clicáveis: a lista "Ações do assistente" continua lista para o leitor de tela, e o HTML fica válido. O painel tem 360 px (o de chamados do console tem 340), para a entrada e a fonte de cada passo caberem sem quebrar demais. A frase da confiança diz de onde ela veio: classificador, resposta rápida conferida pelo código, botão ou valor neutro (classificador fora do ar).

### 10.5 Estados que o mock não mostra (desenhar seguindo o mesmo estilo)
| Situação | Comportamento |
|---|---|
| Agent pensando | Bolha "Nexo Assist" com chips aparecendo **progressivamente** conforme as tools rodam (transparência + latência percebida); texto em streaming |
| Mensagem enviando / falhou | Bolha do funcionário otimista; em falha, ícone de erro + "Tentar novamente" |
| Sistema de chamados indisponível | Chip "sistema de chamados instável, tentei 3×" + mensagem honesta + oferta de analista |
| Falha ou timeout do LLM | Mensagem de erro amigável + "Tentar novamente" + "Falar com um analista" |
| Resposta interrompida (reinício do servidor) | Bolha marcada "resposta interrompida" com retry |
| Conversa transferida (lado do funcionário) | Pílula do topo vira "Aguardando analista" (warning); SystemLine "Transferida para Suporte N2"; composer continua ativo (mensagens vão para o analista, contador congelado) |
| Analista atendendo (lado do funcionário) | Pílula "Com Rafael Lima · Suporte N2"; bolhas do analista com nome e setor |
| Atendimento encerrado | SystemLine + início de nova sessão com resumo |
| Rascunho confirmado / cancelado | DraftCard muda para "Criado · INC-20517" (com link no painel) ou "Cancelado"; botões somem |
| Limite de 30 atingido | Composer bloqueado: "Limite desta sessão atingido" + "Falar com um analista" / "Nova sessão" |
| Nova sessão | Histórico anterior acima, recolhido, + card "Resumo da sessão anterior" |
| Listas vazias | "Você não tem chamados abertos", "Nenhuma conversa neste filtro" |
| Carregamento | Skeletons na lista do console, no histórico e no painel de chamados |
| "Ver todos os chamados" | Expande a lista no próprio painel (não há tela no mock) |

### 10.6 Responsividade (o mock não cobre: só desktop 1440 px, com larguras fixas)
O mock tem 6 frames "(desktop)" e nenhuma variante de tablet ou celular. Medidas fixas que quebram em telas menores: padding de 200 px no chat, lista de 380 + painel de 340 no console, painel de apresentação de 800 px no login. Proposta (A18 revista):
| Largura | Login | Chat do funcionário | Console do analista |
|---|---|---|---|
| ≥ 1280 px | Como o mock | Como o mock; detalhe da decisão em painel lateral (com ele aberto, o recuo lateral da conversa cai de 200 para 48 px, para o card do rascunho não ficar espremido) | Como o mock (4 colunas) |
| 1024–1279 | Painel de apresentação reduzido | Padding lateral cai de 200 para 48 px | Painel de chamados vira gaveta (botão no cabeçalho) |
| 768–1023 | Só o formulário + marca | Sidebar vira rail de ícones; detalhe da decisão em gaveta sobreposta | Rail + lista + conversa; chamados em gaveta |
| < 768 | Só o formulário | Coluna única; menu no topo; detalhe da decisão em *bottom sheet*; opções rápidas e card de rascunho em largura total | Uma coluna por vez: lista → conversa (voltar) → chamados |
- Implementação: breakpoints do Tailwind e os **mesmos componentes**, sem versão mobile separada. Os painéis laterais compartilham um único componente `SidePanel` (lateral fixo ou gaveta, conforme a largura).
- Testes: Playwright roda os fluxos principais também em viewport de celular (390 × 844).

### 10.7 Requisitos não funcionais do frontend
- **Acessibilidade:** navegação por teclado (opções 1–4, Ctrl/⌘+Enter conforme o SO), foco visível, `aria-live` nas respostas do agent, contraste dos tokens checado.
  - **Contraste conferido (T17, WCAG, alfa dos tons suaves já misturado ao fundo):** sobre `paper`, todos os pares de pílula passam de 4,5:1 (de 4,65 a 5,47). Sobre `desk` e `console`, três ficam abaixo: `success-text` 4,14 a 4,36, `warning-text` 4,32 e `primary-text` 4,45. **Regra:** pílula e etiqueta de texto pequeno ficam sobre `paper`; em fundo `desk` ou `console`, a etiqueta ganha fundo `paper` próprio.
  - **Modais:** a gaveta e a folha do `SidePanel` prendem o Tab, fecham com Esc ou clique fora, travam a rolagem do fundo e devolvem o foco a quem abriu. Uma nova renderização do pai (o polling) não mexe no foco.
  - **Avisos:** o `Toast` é uma região viva sempre montada, e só o texto muda; erro usa `alert`.
- **Dados:** TanStack Query para chamadas e polling; nada de store global (só um Context de sessão). Datas e prazos formatados em pt-BR, fuso de São Paulo, numa única função utilitária.
- **Tempo real:** streaming da resposta do agent; polling de 2–3 s só quando necessário (console aberto, conversa com analista).
- **Testes:** componentes com regra visual (DraftCard, TicketCard vencido, QuickOptions por teclado, Composer bloqueado) com Testing Library; fluxos com Playwright.

