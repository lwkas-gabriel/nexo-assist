# ADR-0010: Gemini no plano gratuito como modelo do agent

**Status:** Aceita (30/10/2026). Substitui o [ADR-0008](0008-modelo-claude-haiku.md).

## Contexto
O ADR-0008 escolheu o Claude Haiku, que exige crédito pré-pago na Anthropic. O projeto é um desafio técnico, sem orçamento: o dono do projeto decidiu **não gastar nada** com o modelo. O PRD aceita qualquer provedor de LLM, desde que a escolha seja explicada no README.

O Google oferece um plano gratuito da API do Gemini, sem cartão, com modelos que suportam chamada de função (tools) e saída estruturada, as duas bases do agent.

## Decisão
- **Provedor:** Gemini, pela chave gratuita do Google AI Studio, chamado pelo roteador de modelos do Mastra (`google/<modelo>`), com a chave vinda do `config.ts`.
- **Modelo padrão:** `gemini-3.5-flash-lite`, configurável por `LLM_MODEL`.
  - É um dos dois modelos que o Google recomenda para projetos novos, é estável e suporta tools e saída estruturada.
  - A outra recomendação, o `gemini-3.8-flash`, é mais capaz, mas no plano gratuito tem uma cota diária bem menor. Um agent usa de 2 a 3 chamadas por mensagem, então ele se esgotaria rápido.
- **Raciocínio baixo** (`thinkingLevel: "low"`): menos tokens por chamada e respostas mais rápidas.
- **Uma única nova tentativa do modelo** (`maxRetries: 1` com `maxProcessorRetries: 0`, em `apps/api/src/agent/model-settings.ts`): cobre uma falha passageira sem atrasar demais o aviso quando a cota por minuto acaba. *Revisto na T16:* o Mastra repete em duas camadas que se multiplicam, e só `maxRetries: 1` dava 6 tentativas por chamada (12 por mensagem). Um teste conta as chamadas.
- **Tetos globais de mensagens calibrados pela cota real**, somando todos os usuários. A cota gratuita do `gemini-3.5-flash-lite` no projeto, conferida no AI Studio em 30/10/2026, é de **15 requisições por minuto, 250 mil tokens por minuto e 500 requisições por dia**. Cada mensagem usa até 4 chamadas ao modelo: o classificador (T14) e até 3 passos do agent (`maxSteps: 3`, por exemplo duas tools e a resposta). Por isso:
  - **3 mensagens por minuto** (15 ÷ 4 ≈ 3,75);
  - **120 mensagens por dia** (500 ÷ 4 = 125, com folga). Antes da troca, o teto diário era 500.

  *Revisto na T14:* a primeira conta usava 3 chamadas por mensagem (5 por minuto e 150 por dia), mas um turno com duas tools e o classificador já usava 4, e o 429 do provedor chegaria antes do teto da api.

  Os dois valores ficam no `.env` (`CHAT_MESSAGES_PER_MINUTE` e `CHAT_MESSAGES_PER_DAY`), porque dependem da cota da conta, e não de uma regra do produto. A api recusa o excesso antes de chamar o modelo, sem gastar cota à toa.

  O teto diário conta no **dia da cota do Gemini**, que vira à meia-noite do Pacífico, e fica **no banco** (`usage_counters`), sobrevivendo a reinícios e deploys. Há também um teto diário por IP (40), para uma pessoa sozinha não esgotar o dia de todos. *Revisto na T16:* antes, era uma janela de 24 h em memória, que podia deixar passar o dobro num mesmo dia do Gemini.
- **Histórico do agent com teto de texto** (16 mil caracteres, além das 40 mensagens): no pior caso, mensagens longas reenviadas a cada passo do agent chegariam perto dos 250 mil tokens por minuto.
- **Cota esgotada (HTTP 429)** vira um aviso claro ao funcionário ("o assistente atingiu o limite de uso..."), nunca o erro bruto do provedor.
- **Nada muda no agent em si:** o modo `mock` continua igual, e o CI e os testes E2E seguem sem chamar o modelo real.

## O que não está verificado
- **Cota do `gemini-3.8-flash`:** não foi conferida no AI Studio. Uma fonte de terceiros, não verificada, indica cerca de 20 requisições por dia. A cota do Flash-Lite, que é o modelo em uso, foi conferida (ver acima). A cota diária reinicia à meia-noite, no horário do Pacífico.
- **Qualidade das decisões do agent com o Flash-Lite:** será medida na T11 e na avaliação roteirizada da T27. Se ficar aquém, a troca de modelo é só a variável `LLM_MODEL`.

## Alternativas descartadas
- **Claude Haiku (ADR-0008):** exige crédito pago.
- **`gemini-3.8-flash` como padrão:** mais capaz, mas com cota gratuita pequena demais para um agent. Continua disponível pela variável `LLM_MODEL`.
- **Modelo local (ex.: Ollama):** sem custo de API, mas o deploy público precisaria de uma máquina com GPU.

## Consequências
- **Custo zero:** em desenvolvimento, em testes e no deploy de demonstração.
- **No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele.** É aceitável aqui, porque todos os dados são fictícios (Anexo B). Num uso real com dados de funcionários, seria preciso o plano pago, que não usa o conteúdo.
- **Cotas por minuto e por dia:** um avaliador mandando muitas mensagens seguidas pode ver o aviso de limite. O aviso é honesto e a conversa continua depois.
- **Prompt caching:** o Gemini faz cache implícito de prefixos repetidos; as instruções do agent continuam fixas para aproveitar isso.
- **Achado de segurança:** testar a troca com uma chave inválida mostrou que o erro bruto do provedor (mensagem e stack trace) chegava ao navegador. Foi corrigido para qualquer provedor.
