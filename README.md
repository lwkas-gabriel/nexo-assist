# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras, e o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados e chama um analista quando precisa. Do outro lado, o analista acompanha e assume conversas num console.

> **Status:** em desenvolvimento. Já funciona um esqueleto ponta a ponta (chat → agent → central de ajuda, com streaming); as demais funcionalidades entram tarefa a tarefa, conforme o [plano](docs/PLAN.md).
>
> **Deploy:** _link será adicionado quando o deploy no Railway estiver no ar (ver [Deploy](#deploy))._

## Como rodar

**Pré-requisitos:** Node.js 24 ou superior e pnpm 12 (`npm install -g pnpm` ou `corepack enable`).

```bash
pnpm install       # instala as dependências
pnpm setup:env     # cria (ou completa) o .env de cada app e gera os segredos locais
pnpm db:seed       # cria os bancos e grava os dados de demonstração
pnpm dev           # sobe web (http://localhost:5173), api (:3000) e tickets-service (:3001)
```

Acesse http://localhost:5173.

Por padrão o agent roda com um **modelo de teste** (`LLM_MODE=mock`): funciona sem chave, com respostas roteirizadas. Para usar o modelo de verdade, o **Gemini no plano gratuito** (sem cartão e sem custo), crie uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e edite `apps/api/.env`:

```bash
LLM_MODE=gemini
GEMINI_API_KEY=sua-chave   # nunca commite este valor
LLM_MODEL=gemini-3.5-flash-lite
```

No plano gratuito há cota por minuto e por dia (no `gemini-3.5-flash-lite`: 15 requisições por minuto e 500 por dia); quando ela acaba, o chat mostra um aviso e volta a funcionar depois. O Google pode usar o conteúdo do plano gratuito para melhorar os produtos dele, o que é aceitável aqui porque os dados são fictícios ([ADR-0010](docs/decisions/0010-gemini-plano-gratuito.md)).

> **Windows:** clone o repositório num caminho curto (ex.: `C:\dev\nexo-assist`). Em pastas muito profundas, o pnpm ultrapassa o limite de 260 caracteres de caminho do Windows e falha com "O sistema não pode encontrar o caminho especificado". Outra saída é habilitar caminhos longos no Windows.

### Outros comandos

| Comando                                        | O que faz                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                    | Testes unitários (Vitest)                                                                                         |
| `pnpm test:e2e`                                | Testes ponta a ponta (Playwright), em desktop e celular. Na primeira vez: `pnpm exec playwright install chromium` |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Lint · checagem de tipos · formatação                                                                             |
| `pnpm build`                                   | Checagem de tipos de tudo + build do front                                                                        |

### Variáveis de ambiente

Cada app tem o próprio `.env.example`, com só o que aquele app precisa. Nenhum valor de ambiente fica no código: tudo é lido e validado num único `config.ts` por app, e a aplicação não sobe se faltar alguma variável.

| App             | Variável                   | Para quê                                                                                     |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| api             | `PORT`                     | Porta HTTP da api                                                                            |
| api             | `DATABASE_URL`             | Banco SQLite da api: conversas, mensagens e sessões (`file:./data/api.db`)                   |
| api             | `COOKIE_SECURE`            | `true` em produção (cookie só por HTTPS), `false` no desenvolvimento local                   |
| api             | `SEED_ON_START`            | `true` apaga as conversas de demonstração a cada inicialização (deploy)                      |
| api             | `LLM_MODE`                 | `mock` (modelo de teste, sem chave) ou `gemini` (Gemini no plano gratuito)                   |
| api             | `GEMINI_API_KEY`           | Chave gratuita do Google AI Studio. Obrigatória só com `LLM_MODE=gemini`                     |
| api             | `LLM_MODEL`                | Id do modelo do Gemini (`gemini-3.5-flash-lite`). Obrigatória só com `LLM_MODE=gemini`       |
| api             | `CHAT_MESSAGES_PER_MINUTE` | Teto global de mensagens ao agent por minuto, dentro da cota do modelo (3 no plano gratuito) |
| api             | `CHAT_MESSAGES_PER_DAY`    | Teto global de mensagens ao agent por dia, dentro da cota do modelo (120 no plano gratuito)  |
| api             | `TICKETS_SERVICE_URL`      | Endereço do serviço de chamados                                                              |
| api             | `TICKETS_SERVICE_TOKEN`    | O mesmo segredo do `SERVICE_TOKEN`. Gerado automaticamente pelo `pnpm setup:env`             |
| tickets-service | `PORT`                     | Porta HTTP do serviço de chamados                                                            |
| tickets-service | `DATABASE_URL`             | Banco SQLite do serviço (`file:./data/tickets.db`)                                           |
| tickets-service | `SERVICE_TOKEN`            | Segredo que só a api conhece. Gerado automaticamente pelo `pnpm setup:env`                   |
| tickets-service | `FAILURE_RATE`             | Fração das requisições que falham de propósito (0 a 1), simulando o legado instável          |
| tickets-service | `SEED_ON_START`            | `true` recria os dados de demonstração a cada inicialização (deploy)                         |
| web             | `API_PROXY_TARGET`         | Só no desenvolvimento: para onde o Vite encaminha as chamadas `/api`                         |

Os testes E2E sobem servidores próprios, em outras portas e sempre com `LLM_MODE=mock`: rodar `pnpm test:e2e` nunca chama o modelo real nem gasta a cota gratuita, qualquer que seja o seu `.env`.

### Sistema de chamados instável (simulado)

O PRD diz que o sistema de chamados é legado e às vezes fica indisponível por alguns segundos. O `tickets-service` simula isso com `FAILURE_RATE` (10% por padrão): metade das falhas acontece antes de processar e metade **depois de gravar**, quando a resposta se perde. A api tenta de novo até 3 vezes, com espera crescente, e toda escrita leva uma chave de idempotência: repetir a operação devolve o resultado original em vez de criar um chamado duplicado.

### Dados de demonstração

O `pnpm db:seed` recria os chamados de exemplo (Anexo B) com datas relativas ao momento em que roda, então os cenários do protótipo valem em qualquer dia: a Ana Souza tem 3 chamados abertos (um deles vencido), um resolvido há 4 dias (ainda reabrível) e chamados antigos. Rodar de novo apaga os chamados criados durante os testes.

### Contas de demonstração

Qualquer senha funciona (requisito do desafio). A própria tela de login lista as contas:

| E-mail                                                                                                                                                                                               | Quem é                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ana.souza@nexo.com.br`                                                                                                                                                                              | Ana Souza, funcionária (Financeiro): a dos chamados do protótipo |
| `bruno.tavares@nexo.com.br`, `carla.mendes@nexo.com.br`, `diego.ramos@nexo.com.br`, `elisa.prado@nexo.com.br`, `fabio.nunes@nexo.com.br`, `gabriela.rocha@nexo.com.br`, `henrique.alves@nexo.com.br` | Outros funcionários                                              |
| `rafael.lima@nexo.com.br`                                                                                                                                                                            | Rafael Lima, analista (Suporte N2)                               |
| `juliana.costa@nexo.com.br`                                                                                                                                                                          | Juliana Costa, analista (Suporte N1)                             |

As conversas ficam salvas no banco: dá para sair, voltar outro dia e continuar de onde parou.

### Qualidade e CI

A cada push e pull request para `develop` e `main`, o GitHub Actions ([ci.yml](.github/workflows/ci.yml)) roda três verificações em paralelo:

- **Qualidade:** tipos, lint, formatação, testes unitários e build.
- **E2E:** fluxos no navegador, em desktop e celular.
- **Segurança:** varredura de segredos em todo o histórico (gitleaks) e auditoria de dependências (`pnpm audit`, falha em vulnerabilidade alta ou crítica).

As actions são fixadas pelo hash do commit, e o workflow só tem permissão de leitura.

Localmente, um hook de pre-commit (ativado sozinho no `pnpm install`) roda o gitleaks antes de cada commit, se ele estiver instalado. É opcional, porque o CI faz a mesma varredura: `winget install Gitleaks.Gitleaks` (Windows) ou `brew install gitleaks` (macOS).

## Deploy

O deploy é no [Railway](https://railway.com), configurado em [railway.json](railway.json):

- **Um serviço Node** constrói o front (`pnpm --filter @nexo/web run build`) e roda a api (`pnpm --filter @nexo/api start`), que entrega o front e a api na mesma origem. O TypeScript roda direto no Node 24, sem etapa de build dos servidores ([ADR-0004](docs/decisions/0004-typescript-nativo-no-node.md)).
- **Health check** em `/api/health`; reinício automático em caso de falha.
- **Deploy contínuo a partir da `main`**, que só recebe merge da `develop`.

**Chaves protegidas:** a chave do Gemini existe só nas variáveis do serviço no Railway (`LLM_MODE=gemini`, `GEMINI_API_KEY`, `LLM_MODEL`). Nunca está no código nem no front.

**Uso limitado contra abuso** (o login aceita qualquer senha, por requisito do desafio). Com o Gemini no plano gratuito não há gasto possível; os limites protegem a cota gratuita:

- até 30 mensagens por hora por funcionário e, somando todos, 3 por minuto e 120 por dia, respondendo `429` acima disso. Os tetos globais saem da cota gratuita do Gemini conferida no AI Studio (15 requisições por minuto e 500 por dia, com até 4 chamadas ao modelo por mensagem: o classificador e até 3 passos do agent). Mensagens para um analista não chamam o modelo e não entram nesses tetos;
- até 60 mensagens ao agent por hora e 40 por dia por IP: como qualquer senha entra, uma pessoa poderia usar todas as contas de demonstração. IPv6 conta pela rede /64;
- os tetos diários contam no dia da cota do Gemini (vira à meia-noite do Pacífico) e ficam no banco, sobrevivendo a reinícios;
- no máximo 2 tentativas por chamada ao modelo, quando o provedor falha;
- 30 mensagens ao agent por sessão (RN14), e no máximo 3 passos do agent por resposta;
- até 60 ações de botão (rascunho, nova sessão, falar com analista) e 60 mensagens ao analista por hora por funcionário;
- até 20 tentativas de login por minuto por IP;
- mensagens de até 2.000 caracteres e corpo de até 16 KB;
- raciocínio baixo no modelo (`thinkingLevel: low`), para gastar menos cota por mensagem;
- erros do modelo nunca chegam crus ao navegador: o funcionário vê uma mensagem amigável, e a cota esgotada vira um aviso claro.

Os limites por janela curta (minuto e hora) ficam em memória, o que basta para uma instância só (ADR-0003); com mais de uma instância, iriam para o banco ou para um Redis. Os diários já ficam no banco.

**Custo e latência medidos** (RT10): cada turno grava os tokens do classificador e do agent e a latência, e `pnpm --filter @nexo/api usage:report` resume isso por turno e por conversa. Numa conversa real com o Gemini (dúvida na central de ajuda, consulta de chamado e abertura de chamado), deu **cerca de 10,7 mil tokens por turno**, quase tudo de entrada: instruções, definições das tools e histórico. A conversa toda ficou em **cerca de 32 mil tokens**, com latência de **3,8 s no p50 e 5,7 s no p95**. No plano gratuito isso não custa nada; o que limita é o número de requisições por minuto e por dia, não os tokens (250 mil por minuto).

_O serviço de chamados (`tickets-service`) entra no deploy quando a api passar a usá-lo._

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
- **Gemini no plano gratuito** ([ADR-0010](docs/decisions/0010-gemini-plano-gratuito.md)): custo zero para um desafio sem orçamento, com tools e saída estruturada. Substituiu o Claude Haiku, a escolha inicial ([ADR-0008](docs/decisions/0008-modelo-claude-haiku.md)), que exigiria crédito pago.

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
