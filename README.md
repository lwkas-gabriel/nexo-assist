# Nexo Assist

Agent de atendimento do service desk de TI da Nexo (desafio técnico). O funcionário descreve o problema com as próprias palavras, e o agent consulta os chamados dele, busca na central de ajuda, propõe a abertura ou a atualização de um chamado e chama um analista quando precisa. Do outro lado, o analista acompanha e assume conversas num console. Cada resposta do agent mostra **o que ele entendeu, o que fez, com que confiança e por quê**.

- **Repositório:** este. Trabalho na branch `develop`.
- **Deploy público:** não há. O deploy no Railway ficou pendente (ver [Deploy](#deploy)); o projeto roda localmente com os comandos abaixo.
- **Para quem tem pouco tempo:** [Como rodar](#como-rodar) · [Principais decisões](#principais-decisões) · [Como o agent decide](#como-o-agent-decide) · [Limites conhecidos](#trade-offs-e-limites-conhecidos) · [Desenvolvimento assistido por IA](#desenvolvimento-assistido-por-ia).

## Como rodar

**Pré-requisitos:** Node.js 24 ou superior (`.nvmrc` e `engines`) e pnpm 12 (`corepack enable`, ou `npm install -g pnpm`). Não precisa de Docker nem de banco instalado: o SQLite é um arquivo local.

```bash
pnpm install       # instala as dependências
pnpm setup:env     # cria (ou completa) o .env de cada app e gera os segredos locais
pnpm db:seed       # cria os bancos e grava os dados de demonstração
pnpm dev           # sobe web (http://localhost:5173), api (:3000) e tickets-service (:3001)
```

Acesse http://localhost:5173 e entre com uma das [contas de demonstração](#contas-de-demonstração). Para conferir que a api subiu: `curl http://localhost:3000/api/health`.

Por padrão o agent roda com um **modelo de teste** (`LLM_MODE=mock`): funciona sem chave, com respostas roteirizadas por palavras-chave. Isso basta para ver o fluxo, mas **não representa a qualidade do modelo real**. Para usar o Gemini de verdade, no plano gratuito (sem cartão e sem custo), crie uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e edite `apps/api/.env`:

```bash
LLM_MODE=gemini
GEMINI_API_KEY=sua-chave   # nunca commite este valor
LLM_MODEL=gemini-3.5-flash-lite
```

No plano gratuito há cota por minuto e por dia (no `gemini-3.5-flash-lite`: 15 requisições por minuto e 500 por dia); quando ela acaba, o chat mostra um aviso e volta a funcionar depois. O Google pode usar o conteúdo enviado no plano gratuito para melhorar os produtos dele, o que é aceitável aqui porque os dados são fictícios ([ADR-0010](docs/decisions/0010-gemini-plano-gratuito.md)).

> **Windows:** clone o repositório num caminho curto (ex.: `C:\dev\nexo-assist`). Em pastas muito profundas, o pnpm ultrapassa o limite de 260 caracteres de caminho do Windows e falha com "O sistema não pode encontrar o caminho especificado". Outra saída é habilitar caminhos longos no Windows.

### Comandos

| Comando                                        | O que faz                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                 | Instala as dependências                                                                                                                       |
| `pnpm setup:env`                               | Cria o `.env` de cada app a partir do `.env.example`, sem sobrescrever o que existe, e gera o token compartilhado entre api e tickets-service |
| `pnpm db:seed`                                 | Recria os dados de demonstração (chamados e funcionários)                                                                                     |
| `pnpm dev`                                     | Sobe os três apps em modo de desenvolvimento                                                                                                  |
| `pnpm test`                                    | Testes unitários e de componente (Vitest)                                                                                                     |
| `pnpm test:e2e`                                | Testes ponta a ponta (Playwright), em desktop e celular. Na primeira vez: `pnpm exec playwright install chromium`                             |
| `pnpm eval`                                    | Avaliação roteirizada do agent (ver [Como a qualidade foi garantida](#como-a-qualidade-das-decisões-foi-garantida))                           |
| `pnpm build`                                   | Checagem de tipos de tudo + build do front                                                                                                    |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Tipos · lint · formatação (`pnpm format:check` só confere)                                                                                    |
| `pnpm --filter @nexo/api usage:report`         | Resume tokens e latência por turno e por conversa, a partir dos registros gravados                                                            |

### Variáveis de ambiente

Cada app tem o próprio `.env.example`, com só o que aquele app precisa. Nenhum valor de ambiente fica no código: tudo é lido e validado num único `config.ts` por app (Zod), e a aplicação não sobe se faltar alguma variável. O `pnpm setup:env` já deixa tudo pronto para rodar localmente em modo `mock`.

| App             | Variável                                                        | Para quê                                                                                                    |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| api             | `PORT`                                                          | Porta HTTP da api                                                                                           |
| api             | `DATABASE_URL`                                                  | Banco SQLite da api: conversas, mensagens e sessões (`file:./data/api.db`)                                  |
| api             | `COOKIE_SECURE`                                                 | `true` em produção (cookie só por HTTPS), `false` no desenvolvimento local                                  |
| api             | `SEED_ON_START`                                                 | `true` apaga as conversas de demonstração a cada inicialização (para um deploy); `false` localmente         |
| api             | `LLM_MODE`                                                      | `mock` (modelo de teste, sem chave) ou `gemini` (Gemini no plano gratuito)                                  |
| api             | `GEMINI_API_KEY`                                                | Chave gratuita do Google AI Studio. Obrigatória só com `LLM_MODE=gemini`                                    |
| api             | `LLM_MODEL`                                                     | Id do modelo do Gemini (`gemini-3.5-flash-lite`). Obrigatória só com `LLM_MODE=gemini`                      |
| api             | `CHAT_MESSAGES_PER_MINUTE`                                      | Teto global de mensagens ao agent por minuto, dentro da cota do modelo (3 no plano gratuito)                |
| api             | `CHAT_MESSAGES_PER_DAY`                                         | Teto global de mensagens ao agent por dia, dentro da cota do modelo (120 no plano gratuito)                 |
| api             | `LOGINS_PER_IP_PER_MINUTE`                                      | Opcional. Logins por minuto por IP (padrão 20); só o E2E sobe, porque entra tudo do mesmo IP                |
| api             | `CHAT_MESSAGES_PER_IP_PER_HOUR`, `CHAT_MESSAGES_PER_IP_PER_DAY` | Opcionais. Mensagens ao agent por IP, por hora e por dia (padrão 60 e 40); só o E2E sobe, pelo mesmo motivo |
| api             | `TICKETS_SERVICE_URL`                                           | Endereço do serviço de chamados                                                                             |
| api             | `TICKETS_SERVICE_TOKEN`                                         | O mesmo segredo do `SERVICE_TOKEN`. Gerado automaticamente pelo `pnpm setup:env`                            |
| tickets-service | `PORT`                                                          | Porta HTTP do serviço de chamados                                                                           |
| tickets-service | `DATABASE_URL`                                                  | Banco SQLite do serviço (`file:./data/tickets.db`)                                                          |
| tickets-service | `SERVICE_TOKEN`                                                 | Segredo que só a api conhece. Gerado automaticamente pelo `pnpm setup:env`                                  |
| tickets-service | `FAILURE_RATE`                                                  | Fração das requisições que falham de propósito (0 a 1), simulando o legado instável                         |
| tickets-service | `SEED_ON_START`                                                 | `true` recria os dados de demonstração a cada inicialização (para um deploy); `false` localmente            |
| web             | `API_PROXY_TARGET`                                              | Só no desenvolvimento: para onde o Vite encaminha as chamadas `/api`                                        |

Os testes E2E sobem servidores próprios, em outras portas e sempre com `LLM_MODE=mock`: rodar `pnpm test:e2e` nunca chama o modelo real nem gasta a cota gratuita, qualquer que seja o seu `.env`.

### Contas de demonstração

Qualquer senha funciona (requisito do desafio, não uma prática de produção). A própria tela de login lista as contas:

| E-mail                                                                                                                                                                                                                              | Quem é                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ana.souza@nexo.com.br`                                                                                                                                                                                                             | Ana Souza, funcionária (Financeiro): a dos chamados do protótipo                                                     |
| `bruno.tavares@nexo.com.br`, `carla.mendes@nexo.com.br`, `diego.ramos@nexo.com.br`, `elisa.prado@nexo.com.br`, `fabio.nunes@nexo.com.br`, `gabriela.rocha@nexo.com.br`, `henrique.alves@nexo.com.br`, `isabela.martins@nexo.com.br` | Outros funcionários (a Isabela é usada pelo E2E do console: evite-a numa demonstração ao vivo com os testes rodando) |
| `rafael.lima@nexo.com.br`                                                                                                                                                                                                           | Rafael Lima, analista (Suporte N2)                                                                                   |
| `juliana.costa@nexo.com.br`                                                                                                                                                                                                         | Juliana Costa, analista (Suporte N1)                                                                                 |

O `pnpm db:seed` recria os 10 chamados de exemplo (Anexo B) com datas relativas ao momento em que roda, então os cenários do protótipo valem em qualquer dia: a Ana tem 3 chamados abertos (um deles vencido), um resolvido há 4 dias (ainda reabrível) e chamados antigos. Rodar de novo apaga os chamados criados durante os testes. As conversas ficam salvas no banco: dá para sair, voltar outro dia e continuar de onde parou.

Para ver o fluxo completo com dois lados, abra duas janelas: uma com a Ana (funcionária) e outra com o Rafael (analista). Quando a Ana pede um analista, a conversa aparece no console do Rafael.

## Principais decisões

Cada decisão tem um registro curto (contexto, alternativas descartadas, consequências) em [docs/decisions/](docs/decisions/). O diagrama e as camadas estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
 navegador (React + Vite)
        │  /api  (cookie de sessão, streaming)
        ▼
 apps/api (Hono)  ──►  agent (Mastra)  ──►  Gemini
   http → app → ports ← adapters
        │  HTTP + token de serviço, retry com idempotência
        ▼
 apps/tickets-service (legado simulado, banco próprio)
```

- **Três apps e um pacote compartilhado** ([ADR-0001](docs/decisions/0001-stack-e-monorepo.md), [ADR-0002](docs/decisions/0002-servico-de-chamados-separado.md)). Interface, api com o agent e serviço de chamados são separados, como o desafio pede; as regras de negócio e os contratos HTTP ficam uma vez só em `packages/shared`. O `tickets-service` tem banco próprio e só é acessado pela porta `TicketGateway`: trocar o simulado por um sistema real é escrever outro adapter.
- **React + Vite e Hono, em vez de Next.js.** As telas são todas autenticadas e interativas, sem ganho em renderizar no servidor, e o Next.js juntaria interface e servidor, justamente a separação que o desafio avalia. O Hono é pequeno e serve o front estático na mesma origem.
- **SQLite** ([ADR-0003](docs/decisions/0003-sqlite-e-railway.md)). Conversas e chamados precisam sobreviver a reinício, e rodar local não pode exigir Docker nem conta externa. O limite é um processo de escrita por banco, adequado a este tamanho; escalar pediria Postgres (o Drizzle facilita a migração). As migrações são SQL escrito à mão ([ADR-0009](docs/decisions/0009-migracoes-em-sql-puro.md)).
- **O LLM interpreta, o código garante as regras** ([ADR-0005](docs/decisions/0005-llm-interpreta-codigo-garante.md)): detalhado em [Como o agent decide](#como-o-agent-decide).
- **Turno em duas etapas** ([ADR-0006](docs/decisions/0006-turno-em-duas-etapas.md)). Pedir ao modelo que "registre a decisão no fim" não garante o registro. Um classificador com saída estruturada roda antes do agent e sempre deixa o registro. O custo é uma chamada a mais por mensagem de texto.
- **Gemini no plano gratuito** ([ADR-0010](docs/decisions/0010-gemini-plano-gratuito.md)). O desafio não tem orçamento, e o plano gratuito não exige cartão e suporta tools e saída estruturada. Substituiu o Claude Haiku, a escolha inicial ([ADR-0008](docs/decisions/0008-modelo-claude-haiku.md)), que exigiria crédito pago. A troca de modelo é só a variável `LLM_MODEL`. O preço são as cotas e o uso do conteúdo pelo Google.
- **TypeScript nativo no Node 24** ([ADR-0004](docs/decisions/0004-typescript-nativo-no-node.md)): os servidores rodam direto do código-fonte, sem etapa de build e sem `tsx`.
- **Sessões de chat de 30 mensagens com herança de contexto** ([ADR-0007](docs/decisions/0007-sessoes-de-chat.md)), para o limite não impedir "voltar outro dia e continuar".
- **Navegação por hash** ([ADR-0011](docs/decisions/0011-navegacao-por-hash.md)), sem roteador, para duas páginas do funcionário.
- **Railway** foi a escolha de hospedagem ([ADR-0003](docs/decisions/0003-sqlite-e-railway.md)): servidor de longa duração com disco persistente, que combina com SQLite, streaming e polling. Não foi publicado (ver [Deploy](#deploy)).

## Como o agent decide

Princípio: **o LLM interpreta, o código garante as regras.**

1. **Antes do modelo, o servidor decide se ele deve falar.** Sessão e papel vêm do cookie; os limites de uso são conferidos; se a conversa está com um analista, **o LLM nem é chamado** (RN08).
2. **Etapa 1, classificador.** Saída estruturada com intenção, o que entendeu, campos extraídos, confiança e justificativa. Se ele falhar, o turno segue com confiança neutra e o registro diz isso. Com confiança abaixo de 0,5 o agent pergunta antes de agir; na segunda mensagem seguida com confiança baixa, o código transfere para um analista antes de o agent falar. Esse limiar de 0,5 é provisório (ver [limites](#trade-offs-e-limites-conhecidos)).
3. **Etapa 2, agent com tools.** Recebe a classificação como contexto e tem 8 tools: `search_knowledge_base`, `list_my_tickets`, `get_ticket`, `propose_ticket_draft`, `propose_ticket_update`, `confirm_draft`, `ask_with_options` e `handoff_to_analyst`, em no máximo 3 passos por resposta. Nenhuma tool recebe o dono do chamado: ele vem da sessão.
4. **Regras em código puro e testado** (`packages/shared/src/domain`): prioridade pela matriz impacto × urgência (RN11), prazo em horário útil no fuso de Brasília (RN12, RN13), janela de reabertura de 7 dias (RN06) e candidatos a duplicidade (RN05). O modelo não escolhe a prioridade nem calcula prazo.
5. **O modelo propõe, o código executa.** Criar ou atualizar um chamado só acontece por `confirmDraft`, que exige um rascunho pendente, desta conversa, já mostrado ao funcionário e não alterado (RN04, R04). A confirmação vale igual pelo botão, por Ctrl/⌘+Enter ou digitando "pode criar". **A transferência para um analista (RN07) também grava sem confirmação:** a tool `handoff_to_analyst` muda o chamado ligado para "aguardando analista" e registra o resumo escrito pelo modelo, mas só no chamado do próprio funcionário (RN09) e com o nível e o prazo calculados pelo código.
6. **Cliques não passam pelo modelo.** Confirmar, cancelar, escolher um chamado e "Falar com um analista" são ações estruturadas tratadas pelo código, com confiança 100%. A resposta rápida dispensa só o classificador.
7. **Registro de decisão por turno.** Gravado junto da resposta e exibido no botão "detalhes": o que entendeu, os passos (com a entrada e as fontes), as regras que o código aplicou, a confiança e os sinais que a reduziram (central de ajuda sem artigo, campo faltando, mais de um duplicado, sistema de chamados falhando). A confiança final é a nota do classificador ajustada por esses sinais.
8. **Transferência (handoff).** Pedida pelo funcionário, caso crítico, chamado vencido ou baixa confiança, sempre com um resumo do caso. O nível (N1 ou N2) e o prazo de contato são calculados pelo código, não só pelo motivo que o modelo escolhe: qualquer motivo diferente de "o funcionário pediu" vai para o N2, e um chamado vencido ou crítico sobe para o N2 mesmo com esse motivo; caso crítico tem contato em 1 hora, os demais em 4 horas úteis. Um chamado crítico confirmado é transferido sozinho.

Estados explícitos e testados para conversa, chamado, rascunho e sessão, com troca condicionada à versão (dois analistas assumindo ao mesmo tempo: só um consegue). Detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), seção 11.3.

### Sistema de chamados instável (simulado)

O PRD diz que o sistema de chamados é legado e às vezes fica indisponível por alguns segundos. O `tickets-service` simula isso com `FAILURE_RATE` (10% por padrão): metade das falhas acontece antes de processar e metade **depois de gravar**, quando a resposta se perde. A api tenta de novo até 3 vezes, com espera crescente e timeout de 2 s por tentativa, e toda escrita leva uma chave de idempotência: repetir a operação devolve o resultado original em vez de criar um chamado duplicado. Se esgotar, o funcionário vê uma mensagem honesta e a oferta de falar com um analista.

## Como a qualidade das decisões foi garantida

Três camadas, cada uma cobrindo o que a outra não alcança:

1. **Testes unitários das regras** (Vitest, ID da regra no nome: `it("RN06: ...")`). Regras de negócio, máquinas de estado, privacidade (RN09), confirmação (RN04, R04), limites de uso e validação de config. São determinísticos: sem rede e com relógio injetado.
2. **Avaliação roteirizada do agent (`pnpm eval`).** 18 conversas (22 mensagens) jogadas no **agent de verdade** (o mesmo container do chat), com banco em memória, sistema de chamados fictício e relógio injetado. Confere a **ação escolhida**, não a redação: qual tool foi chamada, tipo e prioridade do rascunho, se transferiu e para qual nível, se bloqueou a duplicidade. Em todo cenário valem os invariantes de privacidade e confirmação: só o dono da sessão é consultado ou recebe chamado (RN09), nenhuma resposta cita chamado alheio e nada é gravado sem um `confirm_draft` de um rascunho proposto em turno anterior. Cobre dúvida na central de ajuda, fora de escopo, pedido vago, incidente, requisição, duplicidade, chamado vencido, caso crítico, consulta sem número, pedido de analista, confirmação e prompt injection. Os cenários são dados validados por Zod em [apps/api/src/eval/scenarios.ts](apps/api/src/eval/scenarios.ts).
3. **E2E (Playwright)** nos fluxos principais, em desktop (1440 × 900) e celular (390 × 844), com o modelo falso: abrir chamado com rascunho, editar, cancelar e confirmar; transferência, o analista assumir, responder e devolver, vistos pelos dois lados. Há também varredura de acessibilidade com axe em 11 estados.

O CI ([ci.yml](.github/workflows/ci.yml)) roda a cada push e pull request para `develop` e `main`: qualidade (tipos, lint, formatação, testes, build), E2E e segurança (varredura de segredos com gitleaks em todo o histórico e `pnpm audit`, que falha em vulnerabilidade alta ou crítica). As actions são fixadas pelo hash do commit e o workflow só tem permissão de leitura. Um hook de pre-commit (ativado sozinho no `pnpm install`) roda o gitleaks localmente, se ele estiver instalado. É opcional, porque o CI faz a mesma varredura: `winget install Gitleaks.Gitleaks` (Windows) ou `brew install gitleaks` (macOS).

**Dois modos da avaliação, escolhidos pelo `LLM_MODE` do `apps/api/.env`:**

- **`mock`** (o `.env.example` traz `mock`): usa o modelo falso, que escolhe a tool por palavras-chave. Roda em segundos, sem chave nem cota, e **só prova que o harness funciona; não mede a qualidade do modelo** (o relatório diz isso em destaque). 12 dos 18 cenários rodam; 6 exigem o modelo real (`requiresRealModel`: fora de escopo, pedido vago com pergunta, requisição, duplicidade, vencido com oferta de analista e crítico com transferência) e ficam "não avaliados", nunca adaptados ao mock.
- **`gemini`:** produz a nota que importa. As mensagens saem espaçadas em 20 s, no máximo 60 por execução, respeitando a cota gratuita; uma resposta 429 ou indisponibilidade do provedor deixa o cenário "não avaliado", nunca como erro de decisão. Uma execução leva alguns minutos; o teto de 60 mensagens é por execução, não por dia, então duas execuções seguidas gastam a cota do dia. Rode uma vez por dia. O comando sai com código 1 se algum cenário falhar e 2 se nada passou ou, no Gemini, se algum ficou sem avaliar. O relatório vai para `apps/api/eval-report.json` (ignorado pelo git, sem o texto das conversas).

> **Nada foi medido com o Gemini real na avaliação.** Num clone limpo, `pnpm eval` no mock dá 12/12 avaliados e cobertura 12/18. Não existe nota do modelo em lugar nenhum deste projeto, porque ela depende de uma chave que não foi usada para rodar o `pnpm eval`. O modelo real foi usado à mão, durante o desenvolvimento, para validar o prompt e medir custo (ver [Desenvolvimento assistido por IA](#desenvolvimento-assistido-por-ia)), mas isso não é uma medição de qualidade.

## Segurança e privacidade

| Ameaça                                  | Medida                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funcionário ver chamado de outro (RN09) | O dono vem **sempre da sessão**, nunca do cliente nem do LLM; nenhuma tool aceita identificação de usuário; o `tickets-service` também filtra pelo dono na própria consulta e responde "não encontrado". Testes tentam acessar chamado alheio                                                                                                                                         |
| Prompt injection                        | O LLM não cria nem altera chamados livremente: só propõe rascunhos, e essa escrita passa pelas checagens de `confirmDraft`. A outra escrita possível, a transferência, só atinge o chamado do próprio funcionário e nunca cria nada. O texto do funcionário não entra no contexto de sistema do agent (há teste com um modelo que grava os prompts). Cenários de injeção na avaliação |
| Criar chamado sem consentimento (RN04)  | Confirmação explícita sobre um rascunho que o funcionário já viu; o servidor recusa o resto, mesmo que o modelo tente                                                                                                                                                                                                                                                                 |
| Analista e console                      | Middleware de papel em todas as rotas do console. O analista vê os chamados de quem está numa conversa aberta (exceção à RN09, A15) e o acesso fica no log                                                                                                                                                                                                                            |
| Sessão e CSRF                           | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção; só o hash do token fica no banco; escritas de outra origem são recusadas; mesma mensagem para e-mail desconhecido                                                                                                                                                                                                            |
| Chave do LLM e segredos                 | Nenhuma chave, token ou URL escrito no código, nem como valor padrão; `process.env` só no `config.ts` de cada app; `.env` fora do git; gitleaks no CI e no pre-commit; nada sensível em variável do front                                                                                                                                                                             |
| Tickets-service exposto                 | Token de serviço comparado em tempo constante; em produção ficaria só na rede privada                                                                                                                                                                                                                                                                                                 |
| Entrada malformada                      | Zod em toda fronteira: corpo HTTP, resposta do tickets-service, argumentos de tools, variáveis de ambiente                                                                                                                                                                                                                                                                            |
| Erro interno chegando ao navegador      | O erro bruto do provedor vai só para o log; o funcionário vê mensagem amigável, e cota esgotada vira um aviso claro                                                                                                                                                                                                                                                                   |
| Abuso e custo (qualquer senha entra)    | Limites de uso, abaixo                                                                                                                                                                                                                                                                                                                                                                |

**Limites de uso** (o login aceita qualquer senha, por requisito do desafio; com o Gemini gratuito não há gasto possível, e os limites protegem a cota). Estão no código e prontos para um deploy público:

- até 30 mensagens por hora por funcionário e, somando todos, 3 por minuto e 120 por dia, respondendo `429` acima disso. Os tetos globais saem da cota do Gemini conferida no AI Studio (15 requisições por minuto e 500 por dia, com até 4 chamadas ao modelo por mensagem). Mensagens para um analista não chamam o modelo e não entram nesses tetos;
- até 60 mensagens ao agent por hora e 40 por dia por IP (uma pessoa poderia usar todas as contas de demonstração); IPv6 conta pela rede /64;
- os tetos diários contam no dia da cota do Gemini (vira à meia-noite do Pacífico) e ficam no banco, sobrevivendo a reinícios;
- 30 mensagens ao agent por sessão (RN14), no máximo 3 passos do agent por resposta e 2 tentativas por chamada ao modelo;
- até 60 ações de botão e 60 mensagens ao analista por hora por funcionário; até 20 tentativas de login por minuto por IP;
- mensagens de até 2.000 caracteres e corpo de até 16 KB; raciocínio baixo no modelo (`thinkingLevel: low`).

Os limites por janela curta (minuto e hora) ficam em memória, o que basta para uma instância só (ADR-0003); com mais de uma, iriam para o banco ou para um Redis. Logs não levam segredos nem o conteúdo das mensagens em nível info.

## Custo e latência por conversa

Cada turno grava os tokens do classificador e do agent e a latência (RT10); `pnpm --filter @nexo/api usage:report` resume por turno e por conversa.

- **Dinheiro:** zero. O Gemini é usado no plano gratuito ([ADR-0010](docs/decisions/0010-gemini-plano-gratuito.md)). Não calculei o custo em dinheiro de um plano pago, porque o preço não está nos documentos do projeto.
- **Chamadas ao modelo:** até 4 por mensagem de texto (classificador + até 3 passos do agent); resposta rápida clicada dispensa o classificador; botões não chamam o modelo.
- **Medição real, com o Gemini:** uma única conversa (dúvida na central de ajuda, consulta de chamado e abertura de chamado) deu cerca de **10,7 mil tokens por turno**, quase tudo de entrada (instruções, definições das tools e histórico), **cerca de 32 mil por conversa**, e latência de **3,8 s no p50 e 5,7 s no p95** ([AI_LOG, entrada 50](docs/AI_LOG.md)). É uma amostra pequena, de uma conversa só; serve como ordem de grandeza.
- **O que limita no plano gratuito** é o número de requisições por minuto e por dia, não os tokens (250 mil por minuto), e os tetos acima cobrem isso. Os ganhos mais baratos que sobraram, e não foram feitos, são o cache de prompt do provedor e enxugar as descrições das tools.

## Trade-offs e limites conhecidos

**Trade-offs assumidos**

- **Mais código no servidor em troca de garantias.** Confirmação, pausa e privacidade são código testado, não instrução de prompt. Custa mais código em volta das tools.
- **Duas etapas por turno.** O classificador garante o registro de decisão, ao custo de uma chamada a mais por mensagem de texto (mais latência e mais cota).
- **Plano gratuito do Gemini.** Custo zero, mas com cotas por minuto e por dia (um avaliador mandando muitas mensagens seguidas pode ver o aviso de limite) e com o Google podendo usar o conteúdo, aceitável só porque os dados são fictícios.
- **SQLite e uma instância.** Um processo de escrita por banco; os limites de janela curta ficam em memória.
- **Polling de 3 s** no console e na conversa transferida, em vez de WebSocket: mais simples, ao custo de requisições repetidas.
- **Feriados ignorados no cálculo de prazo** (A10): num exemplo do seed, em 30/10/2026, o prazo do chamado da Carla caía em 02/11 (Finados), que o cálculo trata como dia útil.
- **O resumo de uma sessão é montado pelo código**, não pelo modelo: não gasta cota nem inventa, mas é menos rico.

**Limites e o que não foi verificado**

- **Nada foi medido com o Gemini real na avaliação (T27).** O `pnpm eval` no mock só prova que o harness funciona. Dependem de uma chave e continuam pendentes: a nota real, a calibração das expectativas dos 6 cenários que exigem o modelo real, o limiar de confiança 0,5 e a decisão sobre o sinal "categoria ambígua" (R09), que não foi implementado.
- **Sem deploy público** (ver [Deploy](#deploy)).
- **E2E só em Chromium**, com o modelo falso: desktop (1440 × 900) e celular emulado (390 × 844). Safari, Firefox e celular físico não foram testados.
- **Leitor de tela real não testado.** A acessibilidade foi conferida com axe (11 estados), testes de DOM e teclado. Zoom de 200% e alto contraste do Windows também não. A borda de campos e botões secundários tem contraste de 1,27:1, abaixo dos 3:1 do WCAG 1.4.11; vem do protótipo e ficou registrada, sem correção ([FRONTEND.md](docs/FRONTEND.md), 10.7).
- **Node 24 pedido, verificação local no 22.** O projeto exige o Node 24 (`engines` e `.nvmrc`), e o CI usa o `.nvmrc`; o último CI da `develop` passou nele. Já as verificações feitas no ambiente de desenvolvimento e a conferência do "como rodar" num clone limpo rodaram no Node 22.23, onde também passaram.
- **Estados raros só têm teste unitário.** "Sistema de chamados instável" e "resposta interrompida" não têm E2E, porque o E2E roda sem falhas simuladas.
- **N+1 na lista do console:** cada atualização (a cada 3 s) faz algumas consultas por conversa. Com as poucas conversas da demonstração é barato; em escala, viria uma consulta agregada. Do mesmo modo, o polling do funcionário com o analista traz a conversa inteira (até 200 mensagens) a cada 3 s.
- **Sem limite de tempo próprio para o LLM no servidor.** A cota esgotada e as falhas do provedor viram aviso, mas um modelo que demora muito deixa o turno esperando (o ARCHITECTURE prevê 30 s, não implementado).
- **"Histórico anterior recolhido" não foi feito:** ao abrir uma nova sessão, o histórico segue visível acima do resumo (10.5 do FRONTEND.md).
- **A cota gratuita pode mudar.** Os tetos de uso foram calibrados pela cota vista no AI Studio em 30/10/2026.

## Deploy

**Não há deploy público.** A configuração do Railway ficou **pendente e adiada**: o cadastro na plataforma não estava liberando, e o dono do projeto decidiu seguir sem ele. Não há data prevista. O que existe é o que roda localmente (acima) e o [railway.json](railway.json), escrito antes (build do front, start da api, health check em `/api/health`), **que nunca foi testado numa plataforma real**.

O plano, descrito em [docs/decisions/0003-sqlite-e-railway.md](docs/decisions/0003-sqlite-e-railway.md), seria uma api que também serve o front na mesma origem e o `tickets-service` num segundo serviço, cada um com seu volume para o SQLite, com deploy contínuo a partir da `main` e a chave do Gemini só nas variáveis do serviço. Ainda faltaria, quando o deploy for feito: criar o projeto e as variáveis, conferir se o proxy da plataforma põe o IP real no fim do `X-Forwarded-For` (o limite por IP depende disso) e acrescentar o `tickets-service` ao deploy.

## Estrutura do projeto

```
apps/web               Interface (React + Vite): chat do funcionário e console do analista
apps/api               Servidor (Hono): autenticação, chat, console e o agent (Mastra)
apps/tickets-service   Serviço de chamados simulado (legado instável), separado da api
packages/shared        Código compartilhado: configuração, regras de negócio (domain), contratos HTTP
e2e/                   Testes ponta a ponta (Playwright)
docs/                  Plano, arquitetura, revisões, decisões (ADRs) e registro de uso de IA
```

Dentro da api, as dependências vão numa direção só: `http → app → ports ← adapters`, e o `domain` não depende de nada. A central de ajuda são 8 artigos em Markdown em `apps/api/knowledge/`, com busca por palavras-chave (sem embeddings). Mais em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/FRONTEND.md](docs/FRONTEND.md).

## Suposições

O PRD e o protótipo deixam pontos em aberto e alguns se contradizem. Cada ambiguidade foi registrada com a pergunta que faríamos ao recrutador e a suposição adotada: [docs/PLAN.md, seção 4](docs/PLAN.md#4-ambiguidades-e-contradições-mock--prd).

## Desenvolvimento assistido por IA

O projeto foi feito com IA de ponta a ponta, e esta seção sai do [docs/AI_LOG.md](docs/AI_LOG.md), o registro que o fluxo mantém por tarefa (o que foi pedido, o que a IA gerou, o que foi corrigido). Os números abaixo são os que o log declara; ninguém de fora os auditou.

**Ferramentas e modelos (como estão no log).** Claude Code na extensão do VS Code, com o Claude Opus 5.5 e modo de planejamento na fase de análise. Nas tarefas mais recentes, o log nomeia os papéis: um sub-agente Sonnet desenvolve e um sub-agente Opus novo, sem o contexto de quem implementou e com esforço alto, revisa. O produto roda no Gemini (plano gratuito); o Claude Haiku foi a escolha inicial para o produto, mas foi trocado antes de qualquer uso real (entradas 27 e 35). O Gemini real foi usado à mão para validar prompts e medir custo, nunca para uma avaliação de qualidade (ver [limites](#trade-offs-e-limites-conhecidos)).

**Como a IA foi guiada.**

- [CLAUDE.md](CLAUDE.md): convenções, boas práticas e "o que nunca fazer" (sem segredo no código, sem `any`, `develop` e nunca `main`, sem assinatura de IA nos commits).
- [docs/PLAN.md](docs/PLAN.md): requisitos numerados (RF, RN, RT) e tarefas pequenas, **uma por vez**, cada uma marcada ao fim. O plano passou antes por quatro rodadas de revisão adversarial, que acharam 47 problemas (R01–R47; oito, na primeira rodada, classificados como críticos) antes de existir código ([REVIEW.md](docs/REVIEW.md)).
- **Um ciclo por tarefa:** o desenvolvedor implementa, um **revisor adversarial independente** relê o diff sem ter visto a implementação, e o orquestrador (a sessão principal) confere typecheck, lint e testes por conta própria, corrige e só então marca a tarefa. O revisor segue a skill versionada [revisao-adversarial](.claude/skills/revisao-adversarial/SKILL.md): lê o código e não o log, tenta confirmar cada achado com um teste ou um cenário concreto, e só relata, sem editar.
- **Regra de teste:** um teste novo só vale depois de falhar com o defeito reintroduzido. Foi aplicada às correções das revisões (entradas 72, 76 e 77).
- **ADRs** para cada decisão de arquitetura e o AI_LOG ao fim de cada tarefa.

**Números que o log sustenta.**

- 32 tarefas marcadas como concluídas no PLAN (T01 a T28, incluindo T02b, T10b, T19b e T26b); a T29, a do README e do deploy, é esta, e o deploy ficou pendente.
- Mais de 100 commits na `develop`, pequenos e em português; o `git log` hoje mostra um único autor (ver o erro de autoria abaixo).
- 860 testes unitários e de componente, e 154 testes E2E passando com 46 ignorados na última rodada registrada (entrada 78; não rodei o E2E ao preparar este README).
- **20 revisões adversariais independentes de tarefa** (T11 a T28, a partir de quando a skill existe; as tarefas T01 a T10b não tiveram). Somando as contagens que cada entrada declara, foram **233 achados**, dos quais **10 críticos, em 7 revisões** (T12, T13, T15, T17, T18, T19 com 4, e T22). O log atribui todos ao revisor, não a quem implementou. As outras 13 revisões não acharam crítico, mas várias acharam achados "importantes".

**Exemplos concretos de onde a IA errou e quem pegou.**

1. **Confirmações simultâneas criavam dois chamados (T12, entrada 43, crítico).** A idempotência da IA estava testada só em sequência. O revisor testou o caso simultâneo (duplo clique, duas abas) e provou a duplicação, que a regra R01 existia para evitar. A correção reserva o rascunho e a chave de idempotência de forma atômica nos dois serviços, e os testes de concorrência novos falham com o código antigo (conferido). O próprio log tinha uma frase falsa sobre isso, corrigida na mesma entrada.
2. **Uma brecha fechada voltou (T15, entrada 49, crítico).** A revisão da T14 tinha tirado o texto do funcionário do contexto de sistema do agent (entrada 47, item 5), mas a IA o reintroduziu no resumo da sessão e na lista de rascunhos. O revisor provou com "IGNORE AS REGRAS ANTERIORES..." aparecendo no prompt de sistema. Agora esses textos só têm conteúdo gerado pelo código, e um teste com um modelo que grava os prompts protege contra a volta.
3. **O modelo real errou onde o código precisava decidir (T13, entrada 44).** Ao transferir um chamado vencido, o Gemini registrou o motivo "o funcionário pediu" e a conversa foi para o N1; o prazo de contato também saiu errado. O nível e o prazo passaram a vir do chamado ligado, no código. É o princípio do projeto aplicado a um erro real: o LLM interpreta, o código garante.
4. **Um comentário afirmava o que ninguém tinha provado (T16, entrada 51).** O código dizia `maxRetries: 1`, mas cada chamada ao modelo era tentada 6 vezes (12 requisições por mensagem, aviso em 18 s), porque o Mastra repete em duas camadas. Só um teste com um modelo que sempre falha, contando as chamadas, achou o parâmetro que controla (`maxProcessorRetries`).
5. **O E2E pegou o que o teste unitário não pegaria (T09/T10, entrada 34).** A forma curta do proxy do Vite reescrevia o cabeçalho `Host`, e a proteção contra CSRF recusava o login no desenvolvimento.

O padrão que se repete: o autor testa o caminho feliz, e o revisor sem contexto testa a corrida, a regressão e o caso em que o teste passaria com o código quebrado (entradas 45, 76 e 77).

**O que a IA fez bem** (segundo o log). Leu a documentação e as versões atuais antes de escrever código com bibliotecas que mudam rápido (entradas 14, 20 e 21); levantou riscos sozinha, como o retry duplicando chamados, o fuso do servidor e o E2E que poderia gastar a cota real (entradas 7 e 24); mediu em vez de estimar quando isso decidia algo (entradas 50 e 51); e auditou antes de escrever os E2E da T28, evitando testes duplicados (entrada 78).

**O que exigiu correção humana.** O dono do projeto decidiu o escopo e corrigiu a IA em pontos importantes: nenhuma assinatura de IA nos commits (entrada 3); README como peça central desde o início (4); nunca trabalhar na `main` (5); segurança e arquitetura que estavam rasas no primeiro plano (6); nenhum segredo no código (8); a responsividade que a IA não tinha checado no protótipo (10); e o custo do modelo, que levou à troca do Claude Haiku pelo Gemini gratuito (27 e 35). Foi também o dono quem apontou um alerta do GitGuardian sobre uma senha literal num teste (56) e uma tarefa marcada como concluída sem a revisão (72).

**Erros de processo registrados.**

- **Autoria dos commits (entradas 76 e 77).** Dez commits saíram com autor `Claude <noreply@anthropic.com>`, contra a regra do `CLAUDE.md`, porque o `git config` local do clone não foi conferido antes de commitar. Por pedido do dono, a `develop` foi reescrita (só autor e committer; datas, mensagens e árvore preservadas), com push forçado, e os hashes citados no log já são os novos. O primeiro push forçado foi bloqueado pelo classificador de permissões e só foi enviado depois de o dono pedir de novo, por escrito. Quem tiver um clone antigo precisa refazer o checkout.
- **Commits que saíram quebrados:** um com o typecheck falhando (entrada 34), outro com a suíte vermelha por um teste lento (entrada 71) e outro que só compila junto com o seguinte (entrada 76). Desde então, a regra é conferir antes de commitar.
- **Tarefa seguiu sem revisão (T25, entrada 72).** Foi marcada como concluída antes da revisão independente; ao fazê-la, saiu um achado alto (a conversa desmontada abortava o envio em curso).
- **Número estimado de cabeça (entrada 74):** o desenvolvedor disse "cerca de 18 logins" no E2E quando eram 20 de 20; o revisor mediu. Repetiu-se na T28 (entrada 78).
- **Commits que misturam assuntos** e **22 commits locais sem push** numa execução longa (entradas 74, 75 e 76), já no histórico e sem reescrita.

## O que faria com mais tempo

- Rodar `pnpm eval` com o Gemini real, calibrar o limiar de confiança 0,5, as expectativas dos 6 cenários dependentes do modelo e decidir sobre o sinal "categoria ambígua".
- Fazer o deploy no Railway, conferindo o IP real atrás do proxy.
- Um limite de tempo para o LLM no servidor, e E2E dos estados "sistema instável" e "resposta interrompida".
- Trocar o polling por um endpoint leve ("houve mudança desde X?") e agregar a lista do console numa consulta só.
- Cache de prompt do provedor e descrições de tools mais enxutas, para baixar os ~10,7 mil tokens por turno; limites de uso no banco ou num Redis para mais de uma instância.
- Testar com leitor de tela real, Safari, Firefox e celular físico; decidir sobre o contraste das bordas de campos (1,27:1).
- Calendário de feriados no cálculo de prazo e presença real do analista na tela de login (hoje são as sessões abertas).
