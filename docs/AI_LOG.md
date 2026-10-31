# Registro de uso de IA

Entradas curtas: o que foi pedido à IA, o que ela gerou, o que foi revisado, corrigido ou decidido diferente, e por quê.
Ferramenta: Claude Code (modelo Claude Opus 5.5) na extensão do VS Code, em modo de planejamento na Fase 1.

---

## Fase 1: análise e plano (29/10/2026)

### 1. Leitura do material e primeiro rascunho
- **Pedido:** ler o PRD (PDF) e o protótipo (`nexo.pen`) e montar um plano com requisitos numerados, ambiguidades, stack e tarefas, sem escrever código.
- **IA gerou:** extração da estrutura do `.pen` (que é JSON) por script, com textos de cada tela e tokens de design. Rascunho com RF01–RF24, RN01–RN14, RT01–RT13, ambiguidades A01–A14 e 29 tarefas.
- **Achados da IA conferidos no material:** o protótipo tem **6 telas** (o PRD cita 5; a extra é "Meu perfil"); o mock promete "2 h úteis" após a transferência, prazo que não existe no Anexo A; o Anexo A diz que chamado vencido *gera* transferência, mas o mock mostra o agent *oferecendo*.

### 2. Decisões de base
- **IA perguntou:** stack/deploy, provedor de LLM, prazo e idioma.
- **Usuário decidiu:** Vite + Hono no Railway (opção recomendada); Claude Haiku; **sem prazo fixo** (resposta fora das opções oferecidas); documentação em português.

### 3. Sem coautoria da IA nos commits (correção do usuário)
- **IA ia seguir** o padrão de assinar commits com `Co-Authored-By`.
- **Usuário rejeitou:** nenhum commit ou PR com coautoria ou assinatura da IA.
- **Por quê:** o uso de IA é documentado aqui e no README, não nos metadados do git. Virou regra no CLAUDE.md.

### 4. README como peça central (correção do usuário)
- **Usuário pediu** que o README explique claramente como rodar o projeto e as principais decisões.
- **Mudança:** o plano ganhou a seção 7.1 com o conteúdo obrigatório do README, e o **esqueleto do README passou para a primeira tarefa (T01)**, atualizado a cada tarefa, em vez de ficar para o fim.

### 5. Branch `develop` (correção do usuário)
- **Usuário pediu:** nada de trabalhar direto na `main`.
- **Mudança:** commit vazio inicial na `main` só para ela existir; todo o trabalho na `develop`; o deploy contínuo sai da `main`, que só recebe merge quando o usuário decidir.

### 6. Segurança, arquitetura e manutenibilidade estavam rasas (correção do usuário)
- **Usuário questionou** o que seria usado para segurança e arquitetura, pedindo foco em manutenibilidade e reuso.
- **IA acrescentou:** estrutura do monorepo em camadas (`http → app → ports ← adapters`), uma tabela ameaça → medida para segurança e regras de manutenibilidade (regras de negócio num lugar só, porta `TicketGateway`, erros tipados).
- **Lição:** o primeiro rascunho cobria *o quê* construir, mas deixava implícito *como* garantir segurança e manutenção. O usuário forçou que isso virasse decisão explícita.

### 7. Primeira revisão adversarial (pedida pelo usuário)
- **Usuário pediu** uma revisão adversarial do próprio plano.
- **IA encontrou 25 problemas** (R01–R25). Os mais graves, que o rascunho anterior **não tinha visto**:
  - **R01:** o retry no sistema legado instável criaria chamados duplicados (POST sem idempotência). Correção: chave de idempotência em toda escrita.
  - **R02:** o servidor no Railway roda em UTC; todos os prazos em horário útil sairiam 3 h errados.
  - **R03:** o limite de 30 mensagens contradizia "voltar outro dia e continuar".
  - **R07:** a ordem das tarefas deixava o mais arriscado (agent, streaming, deploy) para o fim. Correção: esqueleto ponta a ponta (T02b) no início.
- **Usuário decidiu** três pontos em aberto, todos na opção recomendada: sessão nova com contexto; confirmação digitada aceita pelo LLM, mas validada pelo código; turno em duas etapas (classificador + agent) para garantir o registro de decisão.

### 8. Nenhum segredo no código (exigência do usuário)
- **Usuário exigiu:** nenhuma chave ou variável de ambiente exposta no código.
- **Mudança:** regra explícita, incluindo proibir valores padrão (`process.env.X ?? "valor"`); acesso a env só por um `config.ts` validado; regra de lint; gitleaks no CI; nada sensível em variáveis `VITE_*`.

### 9. Mais rodadas adversariais, telas e requisitos não funcionais (pedido do usuário)
- **Usuário pediu** novas rodadas até não sobrar nada, revisão detalhada das telas para o frontend, requisitos funcionais e não funcionais do backend e foco em legibilidade.
- **IA fez:** inventário completo do protótipo (fontes, cores, ícones Lucide, sombras, mapa de status → cor); especificação de frontend; endpoints, máquinas de estado, modelo de dados e requisitos não funcionais do backend; rodadas 2–4 (R26–R47). A rodada 4 não encontrou contradições novas.
- **Achados novos relevantes:** o card de rascunho do mock omite o Tipo (INC/REQ), que a regra exige; o mock não desenha a visão do funcionário durante a transferência; cliques em opções não precisam passar pelo LLM (mais barato e determinístico); confiança baixa deve gerar primeiro uma pergunta, não uma transferência.
- **Legibilidade:** ADRs curtos, documentação dividida em quatro arquivos, IDs de regra nos nomes de testes e commits, resumo em linguagem simples ao fim de cada tarefa.

### 10. Responsividade (pergunta do usuário)
- **Usuário perguntou** se o mock trata responsividade.
- **IA verificou:** não trata. São 6 telas só desktop (1440 px) com larguras fixas (200 px de padding no chat, 380 + 340 px no console) que quebram abaixo de ~1100 px. A IA **não tinha checado isso** antes da pergunta.
- **Usuário decidiu:** chat do funcionário totalmente responsivo; console otimizado para ≥ 1024 px e funcional no celular.

### 11. Idioma do código
- **Usuário decidiu:** identificadores em inglês, com glossário português ↔ inglês no CLAUDE.md.

### 12. Material do desafio fora do repositório
- **IA havia copiado** o PDF do desafio e o protótipo para `docs/` e, antes de commitar, alertou que o repositório público os exporia.
- **Usuário decidiu:** manter os dois só como menção. Entraram no `.gitignore` e continuam disponíveis localmente; o conteúdo relevante já está transcrito em PLAN/FRONTEND/ARCHITECTURE.

---

## Fase 2: T01, base do projeto (29/10/2026)

### 13. Commits pequenos e boas práticas explícitas (pedidos do usuário)
- **Usuário pediu** commits pequenos ao longo da tarefa e boas práticas de programação explícitas.
- **Mudança:** a T01 saiu em 14 commits, um por passo lógico. O CLAUDE.md ganhou uma seção "Boas práticas (obrigatórias)" (legibilidade, tipos, design, erros, frontend), além de convenções, testes e "o que nunca fazer".

### 14. TypeScript 7 descartado (decisão da IA, verificada)
- **IA consultou** as versões atuais antes de instalar: o TypeScript mais recente é o 7.0 (reescrito em Go), mas o `typescript-eslint` declara suporte só até `<6.1`.
- **Decisão:** fixar o TypeScript em 6.0.3 (ADR-0004), em vez de instalar o mais novo e descobrir a quebra depois.

### 15. Imports com `.ts` e servidores sem build (erro encontrado e corrigido)
- **O que falhou:** o Vite não subiu, porque carrega o `vite.config.ts` pelo Node puro, que não resolve imports sem extensão do pacote `shared`.
- **Correção:** imports relativos com extensão `.ts` explícita. A IA verificou que, com isso, o Node 24 roda os servidores direto do TypeScript, e então **removeu o tsx** (uma dependência a menos, nenhum build para os servidores). Registrado no ADR-0004.

### 16. Clone limpo como verificação final
- **IA verificou** a T01 clonando o repositório numa pasta nova e rodando instalação, typecheck, lint, testes, build e E2E, para provar que funciona fora da pasta de trabalho.
- **Achado:** numa pasta muito profunda, o pnpm estourou o limite de 260 caracteres de caminho do Windows. Num caminho curto, tudo passou. Virou uma dica no README.
- **Erro menor da IA:** um script de shell com vários arquivos longos de uma vez falhou na interpretação do texto e não criou nada; os ADRs foram reescritos com a ferramenta de arquivos.

---

## Fase 2: T02, integração contínua (29/10/2026)

### 17. CI com actions fixadas por hash
- **IA gerou:** workflow com três jobs paralelos (qualidade, E2E, segurança), uma action local reutilizável para a preparação (sem repetir passos) e permissão só de leitura. As versões das actions foram consultadas na hora e fixadas pelo hash do commit, não pela tag, para evitar ataque à cadeia de suprimentos.
- **IA conferiu a documentação** da action do gitleaks v3 antes de usar: conta pessoal não precisa de licença; o job recebeu só a leitura de PRs que precisa, com comentários desligados.

### 18. Primeiro run do CI falhou (erro encontrado e corrigido)
- **O que falhou:** a instalação de dependências nos três jobs. O pnpm 12 bloqueia scripts de instalação de dependências por segurança, e o script do esbuild bloqueado, que localmente era só um aviso, interrompia a instalação. O mesmo bloqueio impedia o script `prepare` de ativar o hook de pre-commit.
- **Correção:** política explícita em `pnpm-workspace.yaml` (`allowBuilds: esbuild: false`, com o porquê comentado). A IA validou num clone limpo antes de enviar, e o run seguinte passou nos três jobs.
- **Lição:** a verificação local passava porque a pasta de trabalho já tinha estado instalado. O CI, como o clone limpo da T01, revelou o problema.

### 19. Deploy contínuo adiado para a T02b (decisão da IA)
- **Motivo:** ainda não há o que publicar de útil; a api servir o front é parte da T02b. Configurar o Railway agora seria configuração sem verificação.

---

## Fase 2: T02b, esqueleto ponta a ponta (29/10/2026)

### 20. Referência oficial antes de escrever código com Claude
- **IA carregou** a referência da API da Anthropic antes de codificar. Ela confirmou o id `claude-haiku-5-5` e o preço, e trouxe um fato que mudou a configuração: no Haiku 5.5 o raciocínio vem ligado por padrão (`effort` médio), o que custa tokens e latência. O agent passou a usar `effort: low`.
- **Desvio consciente da recomendação da referência** (usar o SDK oficial da Anthropic): o PRD prefere Mastra, então o Claude é chamado pelo roteador de modelos do Mastra.

### 21. Documentação do Mastra lida, não presumida
- **IA leu a documentação atual** do Mastra (agent, tools, request context, integração com `useChat`) antes de escrever, porque a biblioteca muda rápido.
- **Decisão:** passar o modelo como `{ id, apiKey }`, com a chave vinda do `config.ts`. O formato "string" faria o Mastra ler `ANTHROPIC_API_KEY` sozinho do ambiente, contornando a regra de um único ponto de leitura de env. Bônus: dispensou o pacote `@ai-sdk/anthropic`.

### 22. Política de idade mínima de dependências (achado da IA)
- **O que aconteceu:** ao instalar `ai@7.0.157` (publicado havia 4 horas), o pnpm abriu exceções automáticas na política de cadeia de suprimentos, que bloqueia versões recém-publicadas.
- **Correção:** a IA recusou as exceções, usou versões mais antigas, deixou a política explícita (`minimumReleaseAge: 1440`) e regenerou o lockfile. Ao investigar entradas sumidas no lockfile, confirmou que eram restos do esbuild (dependência do tsx removido), não binários necessários.

### 23. Tipos incompatíveis entre Mastra e AI SDK (erro encontrado e corrigido)
- **O que falhou:** o modelo falso do AI SDK não era aceito pelo Mastra.
- **Causa:** o Mastra 1.80 embute a especificação `@ai-sdk/provider` 4.0.29; o `ai` instalado usava a 4.0.34.
- **Correção:** fixar `ai@7.0.143` e `@ai-sdk/react@4.0.147`, as versões que usam a mesma especificação. A IA testou a hipótese antes de aplicar.

### 24. Testes E2E poderiam gerar custo real (achado da IA)
- **Risco:** os testes reaproveitavam o `pnpm dev` em execução. Com `LLM_MODE=anthropic` no `.env`, rodar os testes chamaria o Claude de verdade.
- **Correção:** o Playwright sobe servidores próprios, em portas separadas e sempre com o modelo de teste.

### 25. Proteção antes do deploy público (decisão da IA)
- O login aceita qualquer senha e o deploy é público. A IA antecipou da T16 um limite de 30 mensagens por hora por IP e um teto diário global de 500, além de limites de tamanho de mensagem e cabeçalhos de segurança, todos testados. O IP vem do último item do `X-Forwarded-For`, porque os anteriores podem ser forjados.
- Um teste prova que o servidor de arquivos estáticos não expõe arquivos fora da pasta do build (path traversal).

### 26. Desvios do plano
- **Sem "login fake":** a autenticação real é a T10; um login falso seria código descartável.
- **Só a api no deploy:** o tickets-service entra quando a api passar a usá-lo, evitando custo de um serviço ocioso.

### 27. Teste manual e decisões de custo (usuário)
- **Usuário testou** o esqueleto localmente no modo de teste: mensagem enviada, chip "buscou na central de ajuda" e resposta citando o artigo, como esperado.
- **Usuário questionou o custo** da API da Anthropic. A IA explicou que a chave é grátis, mas o uso é pré-pago (estimativa: menos de um décimo de centavo de dólar por mensagem com o Haiku), e mostrou que o modo de teste permite desenvolver quase tudo sem custo.
- **Usuário decidiu:** manter o Claude Haiku (crédito comprado perto da T11, quando a qualidade do agent precisa do modelo real) e **adiar o deploy para o fim do projeto (T29)**, publicando uma vez com tudo pronto. O `railway.json` e as proteções contra abuso ficam prontos desde já.

---

## Fase 3: desenvolvimento das regras

### 28. T03: vocabulário do domínio e campos obrigatórios
- **IA gerou:** tipos, categorias, prioridades, afetados e status como listas `as const` (sem `enum`, conforme o ADR-0004), com rótulos em português num lugar só; leitura do número do chamado escrito de vários jeitos ("inc 20311"); e a validação do rascunho campo a campo, que devolve **a lista ordenada do que falta**, base para o agent perguntar só o necessário.
- **Decisão da IA, registrada como suposição A23:** a opção "Não sei" do protótipo não é um valor de "afetados"; o agent faz uma pergunta mais concreta e, se preciso, assume "só eu", explicando no rascunho que o funcionário confere.

### 29. T04: prazos em horário útil
- **IA gerou:** calendário de horário útil configurável (fuso, abertura e fechamento), só com `Intl` (sem biblioteca de datas), e os prazos por prioridade com a situação de vencimento.
- **Cuidados que vieram da revisão adversarial:** cálculo no fuso de Brasília mesmo com o servidor em UTC (R02), com teste explícito disso; prazo contado da última atualização da equipe de TI (A17).
- **Decisão da IA:** o Brasil não tem horário de verão hoje, mas o código não presume isso; um teste num fuso com horário de verão prova que a virada é tratada.
- **Suposição nova A24:** "N dias úteis" = N × 10 h de expediente.
- **Correções durante a tarefa:** um tipo frouxo (`string` no lugar dos campos do `Intl`) pego pelo typecheck, e uma variável descartada num teste pega pelo lint; o teste foi reescrito de forma mais legível em vez de afrouxar a regra.

### 30. T05 e T06: prioridade, reabertura e duplicidade
- **T05:** matriz de prioridade como tabela no código (RN11 + fronteiras da A06), devolvendo também a justificativa legível ("RN11: somente você + compromisso hoje → Alta") para o registro de decisão. Um teste de propriedade garante que mais gente afetada nunca baixa a prioridade.
- **T06:** reabertura (RN06) decidida 100% em código. Para duplicidade (RN05), a IA dividiu a responsabilidade: o código aponta candidatos com a ação aplicável (atualizar se aberto, reabrir se resolvido há até 7 dias) e o agent confirma com o funcionário, porque semelhança de palavras sozinha erraria nos dois sentidos.
- **Refatoração:** a normalização de texto saiu da central de ajuda para o domínio compartilhado, em vez de ser duplicada.

### 31. T07: o serviço de chamados
- **Decisão da IA (ADR-0009):** o gerador de migrações do Drizzle traria `tsx` e `esbuild` de volta (com scripts de instalação, que já derrubaram o CI). As migrações passaram a ser SQL escrito à mão, aplicadas por um executor pequeno e testado; o Drizzle ficou só para as consultas tipadas, com um teste que pega divergência entre o SQL e o schema.
- **Privacidade na consulta:** toda busca filtra pelo dono; chamado de outra pessoa responde "não encontrado", sem revelar que existe.
- **Segredo sem atrito e sem código:** o `pnpm setup:env` passou a gerar localmente o token compartilhado entre api e tickets-service (o mesmo valor nos dois `.env`) e a completar `.env` existentes quando surgem variáveis novas, sem sobrescrever nada.
- **Dados de demonstração** com datas relativas (R08), e testes que verificam os cenários do protótipo (vencido, em dia, reabrível) usando as próprias regras do domínio, numa segunda e num sábado.
- **Reuso:** o relógio injetável e a normalização de texto foram para o domínio compartilhado; erros tipados, contratos HTTP e usuários de demonstração também ficaram em `packages/shared`.
- **Correções durante a tarefa:** o lint pegou uma conversão de valor do banco que podia virar "[object Object]"; a IA trocou um método só para testes que tinha colocado no serviço de produção por um ajuste direto no banco do teste; um heredoc do shell falhou com um apóstrofo no texto, e os arquivos foram escritos com a ferramenta de arquivos.

### 32. T08: legado instável, retry e idempotência
- **IA gerou:** simulação de falhas no tickets-service em dois momentos (antes de processar e depois de gravar, quando a resposta se perde), idempotência obrigatória em todo POST e um cliente HTTP na api com timeout, até 3 tentativas com espera crescente e variação aleatória, reusando a mesma chave de idempotência.
- **O teste que fecha o achado R01 da revisão:** falha depois de gravar + retry com a mesma chave = um único chamado.
- **Decisões:** só tenta de novo o que pode mudar (rede, timeout, 5xx); 404 e 409 viram respostas de negócio para o agent explicar; qualquer outro 4xx é erro nosso e não vaza detalhes. A resposta do serviço é validada pelo contrato compartilhado antes de ser usada.
- **Segredos nos testes:** os testes e o E2E geram tokens aleatórios a cada execução, em vez de escrever um valor fixo no código.
- **Desvio:** a latência simulada do plano (`FAILURE_LATENCY_MS`) ficou de fora; o comportamento com timeout é coberto nos testes do gateway.

### 33. T09, T10 e T10b: persistência, login e segurança
- **Ordem ajustada pela IA:** as T09 e T10 foram feitas juntas, porque a conversa pertence ao funcionário logado; persistir sem login exigiria um "usuário provisório" descartável.
- **Decisões de segurança:** o banco guarda só o hash do token de sessão; cookie HttpOnly e SameSite=Lax (Secure em produção); mesma mensagem para e-mail desconhecido (R44); escritas de outra origem recusadas (CSRF); limite de tentativas de login; ids de mensagem gerados pelo servidor; e o navegador manda só o texto novo, então o histórico (no banco) não pode ser forjado, fechando a brecha registrada na T02b.
- **Persistência provada:** um teste grava uma conversa num banco em arquivo, monta outro container com o mesmo arquivo (simula um reinício) e encontra a conversa (RT06); no E2E, a conversa continua depois de recarregar a página (RF11).
- **Reuso:** o executor de migrações, a abertura do banco e a validação de entrada HTTP passaram para `packages/shared`; uma regra de lint garante que as partes do `shared` usadas pelo navegador não importem módulos do Node.

### 34. Erros da IA corrigidos nesta etapa (registro honesto)
- **Commit com typecheck falhando:** a IA encadeou o commit depois das verificações sem interromper na falha. Foi corrigido no commit seguinte, e desde então o commit só roda se typecheck, lint e testes passarem.
- **Duplicação evitada:** a IA chegou a copiar o arquivo de validação HTTP da api para o tickets-service e desfez na mesma hora, movendo-o para o `shared`.
- **O E2E pegou o que os testes unitários não pegariam:** a forma curta do proxy do Vite reescreve o cabeçalho Host, e a proteção contra CSRF recusava o login no desenvolvimento. A correção mantém o Host original, reproduzindo a mesma origem da produção.
- **Ferramenta:** heredocs do shell falharam algumas vezes com textos longos; a IA passou a escrever arquivos sempre com a ferramenta de arquivos.

---

## Troca de provedor: Claude Haiku → Gemini no plano gratuito (30/10/2026)

### 35. Decisão do usuário: custo zero
- **Usuário decidiu** não gastar nada com o modelo ("é um desafio, não vejo necessidade de gastar") e pediu a troca para o plano gratuito do Gemini, com o mapeamento do impacto antes e a troca documentada no plano.
- **IA mapeou primeiro:** a troca só tocava a config, a criação do modelo, o `.env.example` e os testes da config; o agent, as tools e o modo de teste não mudavam. O resto era documentação (ADR, plano, README).
- **IA pesquisou antes de escolher:** pela documentação oficial, o Google recomenda o 3.8 Flash e o 3.5 Flash-Lite para projetos novos, ambos com tools e saída estruturada. Os limites exatos do plano gratuito não estão na documentação (são vistos por projeto no AI Studio); uma fonte de terceiros, **não verificada**, indica cerca de 20 requisições por dia no 3.8 Flash e 500 no Flash-Lite. Como um agent faz de 2 a 3 chamadas por mensagem, a IA escolheu o **3.5 Flash-Lite** como padrão (configurável) e baixou o teto diário de 500 para 150 mensagens. Tudo isso, incluindo o que não foi verificado, está no ADR-0010.
- **IA provou a rota sem gastar:** chamou o Gemini com uma chave propositalmente inválida para confirmar que o Mastra encaminha o modelo ao Google, mesmo sem conhecer o 3.5 Flash-Lite no registro interno dele.

### 36. Achado de segurança durante a troca
- **O mesmo teste revelou** que, quando o modelo falha, o erro bruto do provedor (mensagem e stack trace com caminhos do servidor) chegava ao navegador. O problema valia para qualquer provedor, inclusive o Claude.
- **Correção:** o detalhe vai só para o log do servidor; o funcionário vê uma mensagem amigável; a cota esgotada (429, inclusive depois das novas tentativas, quando o AI SDK embrulha o erro num `RetryError`) vira um aviso claro. Um teste com um modelo que falha prova que nada vaza.
- **Ajuste ligado à cota:** o modelo passou a ter só uma nova tentativa (o padrão do AI SDK eram duas, cerca de 6 s de espera), para o aviso de cota esgotada não demorar.
- **Correção de documentação aproveitada:** o README ainda dizia "30 mensagens por hora por IP" e "corpo de até 64 KB", desatualizados desde a T10.

### 37. Cota real conferida e limites calibrados
- **Usuário conferiu no AI Studio** a cota gratuita do `gemini-3.5-flash-lite` no projeto: 15 requisições por minuto, 250 mil tokens por minuto e 500 requisições por dia. Os contadores já mostravam uma requisição, confirmando que a chave dele funcionou.
- **Ajuste da IA:** o teto diário de 150 mensagens estava certo, mas o limite por minuto era o mais apertado, e nada no projeto o respeitava. Entrou um teto global de 5 mensagens por minuto (15 ÷ 3 chamadas por mensagem), para a api recusar antes de gastar cota.
- **Decisão de desenho:** os dois tetos globais passaram para o `.env`, porque dependem da cota da conta, e não de uma regra do produto. Isso também evita que os testes E2E em paralelo esbarrem no limite, já que eles usam tetos altos. O limite de 30 mensagens por hora por funcionário continua no código, como regra do produto.

---

## T11: o agent consulta chamados (30/10/2026)

### 38. Validação manual do usuário com o Gemini real
- **Usuário criou a chave gratuita, testou o chat e avaliou:** "a resposta foi boa". Esse foi o primeiro uso do modelo real no projeto.

### 39. T11: tools de chamados e prompt com as regras do Anexo A
- **IA gerou:** `list_my_tickets` e `get_ticket`, que **não recebem quem é o funcionário**: ele vem da sessão pelo contexto do turno, e sem ele a tool falha fechada. O chamado chega ao agent com rótulos em português, datas em Brasília e o prazo já calculado pelo domínio, então o modelo não faz conta nem converte fuso. O prompt diz como decidir entre central de ajuda, lista e consulta por número, e inclui uma regra para **nunca dizer que fez uma ação que não fez**, porque abrir e transferir chamados só chegam nas T12 e T13.
- **Validação com o Gemini real** (4 conversas, cerca de 10 chamadas da cota gratuita): listou os 3 chamados da tela 3 e perguntou qual; entendeu "o do notebook" pelo contexto e avisou que o prazo de 3 dias úteis venceu; recusou o chamado de outra pessoa sem nem consultar; redirecionou férias para o RH com o ramal certo.
- **Ajuste feito com base no modelo real:** o Gemini respondia em markdown, que o chat mostraria como asteriscos. O prompt passou a pedir texto simples com marcadores "• ".
- **O E2E pegou um problema de desenho dos testes:** dois testes em paralelo dividiam a mesma conversa e esbarravam, corretamente, na regra de um turno por vez (R06). Cada teste que envia mensagem passou a ter um funcionário próprio; Fábio Nunes e Gabriela Rocha, que aparecem na tela 4 do protótipo, entraram nas pessoas de demonstração.

### 40. Primeira revisão adversarial independente (T11)
- **Pedido do usuário:** ao fim de cada tarefa, uma revisão adversarial feita por um sub-agente **sem o contexto** da implementação, para ser imparcial. A IA criou a skill versionada `.claude/skills/revisao-adversarial/SKILL.md` com o procedimento (o que ler, o que procurar, como confirmar e o formato do relatório) e disparou um sub-agente novo com apenas a tarefa e o intervalo de commits.
- **Resultado:** nenhum achado crítico; 1 importante e 8 menores, todos conferidos e corrigidos:
  1. **Importante:** quando a TI nunca tinha respondido, o agent recebia a data de abertura como "última atualização da equipe de TI" e poderia afirmar uma atualização inexistente. Agora recebe `null`, e o prompt manda dizer que a TI ainda não respondeu. Validado com o Gemini real.
  2. Erros inesperados das tools viram `tickets_error`, com o detalhe só no log.
  3. Chamado crítico ou alto vencido saía como "há 0 dias"; o domínio passou a descrever o tempo em horas ou dias.
  4. Faltavam testes das tools: número inválido, erro interno e contexto sem funcionário.
  5. Faltava um teste de rota provando a ligação sessão → chat → agent → tool.
  6. Ternário aninhado (proibido pelo CLAUDE.md) virou uma tabela tipada.
  7. Regras duplicadas: o início do prazo passou a vir do domínio (`slaClockStart`), e a reabertura e o filtro de abertos passaram a usar as funções do domínio.
  8. O ramal 4000 do service desk, que só existia no protótipo, foi para a central de ajuda.
  9. O CLAUDE.md e a arquitetura se contradiziam sobre o agent usar portas; a regra foi alinhada.
- **Lição:** o revisor sem contexto pegou um problema de comportamento do agent (afirmar uma atualização que não existiu) que os testes da própria implementação não pegavam, porque o caso "TI nunca respondeu" não estava coberto.
- **Observação registrada:** o prazo do chamado da Carla venceria em 02/11 (Finados), porque feriados são ignorados por decisão (A10). Fica como exemplo concreto dessa limitação para o README.

---

## T12: rascunho, confirmação e complemento de chamados (30/10/2026)

### 41. T12: o agent propõe, o funcionário confirma, o código garante
- **IA gerou:** a tabela `drafts` e um caso de uso único (`draft-service`) usado tanto pelas tools do agent quanto pelos botões do card. Propor nunca cria nada: a resposta diz o que falta (RN03, com os nomes que o agent usa para perguntar), aponta chamados parecidos antes de criar outro (RN05) ou devolve o rascunho com a prioridade **calculada pela matriz** (RN11), nunca escolhida pelo modelo. Complementar um chamado resolvido há até 7 dias o reabre (RN06).
- **R04 implementado como regra do servidor:** o turno do agent leva a conversa e a hora em que a mensagem do funcionário chegou. `confirm_draft` só aceita um rascunho desta conversa, pendente e que já existia, sem mudanças, antes dessa mensagem. Na prática, o agent não consegue propor e confirmar na mesma resposta, nem confirmar o rascunho de outra conversa, mesmo que o modelo tente.
- **Idempotência ponta a ponta (R01):** cada rascunho tem uma chave aleatória usada na escrita no tickets-service. Confirmar duas vezes em sequência não duplica o chamado. *(Correção: a versão original deste item dizia que "o botão e o texto ao mesmo tempo" também não duplicavam. Era falso, e a revisão adversarial provou isso; ver o item 43.)* O seed do tickets-service passou a apagar as chaves antigas, que apontariam para chamados apagados.
- **Botões sem LLM (11.5):** confirmar, cancelar e editar pelo card são rotas determinísticas, válidas só na conversa aberta do funcionário. Cada ação vira uma linha de sistema na conversa, para o agent saber no turno seguinte o que mudou. Editar recalcula a prioridade; a prioridade em si não é editável (R16).
- **Erro pego pelos testes:** o schema de entrada exigia a prioridade, que o agent nem manda. Os testes do caso de uso falharam todos de uma vez, e a correção separou o schema do que o agent extrai do schema do que fica gravado.

### 42. Validação com o Gemini real (T12)
- **3 conversas, cerca de 12 chamadas da cota gratuita:** abriu o chamado da VPN da tela 2 com prioridade Alta (só eu + reunião hoje) e só criou depois do "pode criar"; recusou criar outro chamado "crítico" a pedido, explicando que a prioridade vem das regras; complementou o INC-20311 achando o chamado pela descrição ("o do notebook lento") e só enviou depois da confirmação; abriu uma requisição de acesso com prioridade Baixa.
- **Ajuste feito com base no modelo real:** depois de confirmar, o modelo disse "até as 12:00 de hoje" para uma previsão de 02/11 (outro dia). O resultado de `confirm_draft` passou a trazer a previsão explícita, o prompt manda repetir data e hora como vieram, e o rascunho confirmado guarda o prazo da hora da confirmação. Também passou a explicar a prioridade sem o código da regra ("RN11"), que é jargão para o funcionário.

### 43. Revisão adversarial independente da T12
- **Como:** sub-agente novo, sem o contexto da implementação, seguindo a skill `revisao-adversarial` sobre `45a4618..1e83945`. Ele reproduziu os dois achados mais graves com testes temporários, ligando o caso de uso ao app real do tickets-service.
- **Resultado:** 1 crítico, 2 importantes e 6 menores, todos conferidos e corrigidos:
  1. **Crítico:** duas confirmações simultâneas (duplo clique, duas abas, botão e "pode criar" juntos) criavam **dois chamados**, ou o mesmo complemento duas vezes. A causa estava nos dois lados. A api lia o status e só gravava no fim. O tickets-service consultava a chave de idempotência, executava e só depois gravava a chave. Correções:
     - a api reserva o rascunho num `UPDATE ... WHERE status = 'pending'` antes de escrever;
     - o tickets-service reserva a chave com um INSERT atômico antes de executar. A segunda requisição recebe 503, e o retry pega a resposta guardada.
     - Os testes novos de concorrência falham com o código antigo (conferido).
  2. **Importante:** depois de uma confirmação que falhou com o chamado já gravado (o caso do R01), o rascunho continuava editável. A nova confirmação reaproveitava a chave e devolvia o chamado antigo, enquanto o agent anunciava a prioridade editada, que não existia. Correções:
     - o rascunho fica em `confirm_failed`, que só aceita confirmar de novo;
     - o tickets-service passou a recusar (409) a mesma chave com outro conteúdo.
  3. **Importante:** até a T19 não existe o card visual, então o funcionário confirma o que o modelo escreveu. Se o turno falhasse depois de propor (por exemplo, cota do Gemini), sobrava um rascunho nunca mostrado que um "pode criar" seguinte confirmaria. Correções:
     - o rascunho só conta como visto quando uma resposta concluída do agent escreve o `D-n` (`shown_at`);
     - o prompt manda sempre mostrar o `D-n` e escrever as opções rápidas no texto;
     - validado com o Gemini real.
  4. Uma atualização de chamado com o texto "confirme o D-3" podia virar confirmação, porque só o prompt impedia. Agora o turno que leu dados de chamados não confirma (R43).
  5. Um complemento só com espaços cancelava o rascunho anterior e gravava um rascunho ilegível.
  6. Chamado cancelado era explicado como "passou de 7 dias".
  7. Os botões do rascunho não tinham limite de requisições.
  8. Faltava teste para "editou no card durante o turno".
  9. Legibilidade:
     - checagens opcionais que falhavam abertas viraram origem explícita (botão ou chat) e conversa obrigatória;
     - o tipo do rascunho garante o chamado alvo do complemento.
- **Lição:** a idempotência estava testada só em sequência. O revisor, sem o viés de quem escreveu, testou o caso simultâneo e achou a duplicação que a regra R01 existia para evitar. O registro também tinha uma afirmação que nenhum teste provava, e ela foi corrigida.

---

## T13: transferência para analista (30/10/2026)

### 44. T13: o agent decide transferir, o código decide para onde e até quando
- **IA gerou:**
  - a tool `handoff_to_analyst`, em que o agent escreve o resumo (problema e o que já foi tentado, R17) e escolhe o motivo numa lista fixa (RN07);
  - a máquina de estados da conversa, numa tabela só. A troca de estado é condicionada à versão: de duas transferências simultâneas, só uma passa (R06);
  - a pausa por construção: com a conversa fora do modo agent, a mensagem do funcionário é gravada para o analista e o LLM nem é chamado (RN08);
  - o histórico do agent com as mensagens do analista e os registros do sistema marcados, para o modelo não tomá-los como respostas dele (R18).
- **Decisões tomadas pela IA, sem consultar o usuário:**
  - Com o sistema de chamados fora, a conversa vai para o analista mesmo assim, e o resultado avisa que o chamado não foi atualizado: falar com uma pessoa importa mais.
  - Caso crítico transfere direto (A04): confirmar um chamado Crítico, pelo chat ou pelo botão, leva a conversa para o N2 no código, sem depender de o agent lembrar.
  - O limiar numérico de confiança fica para a T14, junto com o classificador que produz a confiança. Na T13, o prompt manda perguntar antes de transferir por falta de segurança (R39).
- **Erros pegos pelo Gemini real** (3 conversas, cerca de 10 chamadas da cota gratuita):
  1. Ao transferir um chamado vencido, o modelo registrou o motivo "o funcionário pediu" e a conversa foi para o N1. O nível passou a ser decidido pelo chamado ligado (vencido ou crítico → N2), não só pelo motivo que o modelo escolhe. É o princípio do projeto: o LLM interpreta, o código garante.
  2. O prazo de contato saiu "até 04/11", porque seguia os 3 dias úteis da prioridade Média, num chamado que já estava vencido. A suposição A02 foi revista: crítico, 1 hora; os demais, 4 horas úteis. O protótipo mostra "em até 2 h úteis", o que também aponta para um prazo curto.
- **Validação final com o modelo real:**
  - ofereceu um analista para o chamado vencido e transferiu para o N2 com o resumo certo;
  - depois da transferência, ficou calado ("obrigada" não teve resposta do agent);
  - "a VPN caiu para todo o Financeiro" virou rascunho Crítico e, confirmado, foi transferido sozinho para o N2, com contato em 1 hora.

### 45. Revisão adversarial independente da T13
- **Como:** sub-agente novo, sem o contexto da implementação, com a skill `revisao-adversarial` sobre `c036750..5bdb828`. Ele confirmou cada hipótese com testes temporários e LLM falso.
- **Resultado:** 1 crítico, 5 importantes e 5 menores. As correções:
  1. **Crítico:** um caso crítico relatado sem chamado ligado recebia contato em 4 horas úteis. Numa sexta à tarde, isso dava cerca de 66 horas. O prazo de 1 hora passou a valer pelo motivo ou pela prioridade (A02).
  2. Se a transferência automática do chamado crítico falhasse, por exemplo numa corrida com uma transferência feita pelo agent no mesmo passo, a confirmação aparecia como falha, com o chamado já criado. Agora a confirmação vale e o resultado traz `escalationFailed`; uma transferência simultânea não é tratada como erro.
  3. O resumo do crítico (título + descrição) podia passar do limite do sistema de chamados, e o chamado ficava sem a marcação de "aguardando analista". O resumo agora é limitado. O gateway falso dos testes passou a validar o contrato como o serviço real.
  4. A transferência automática pelo chat não tinha teste; agora tem.
  5. As mensagens para o analista gastavam a cota do modelo, que nem é chamado. Um funcionário falando com uma pessoa podia esgotar o teto diário de todos. Elas passaram a ter um limite próprio por funcionário (R42).
  6. Três testes passavam por acaso: o chamado "vencido" não estava vencido, e o status conferido já era o inicial. Foram reescritos com chamados de fato vencidos e asserções que provam o que dizem.
  7. Uma falha inesperada ao atualizar o chamado deixava a conversa na fila sem resumo e sem aviso. Correções:
     - o resumo e o aviso são gravados logo depois da troca de estado;
     - o sistema de chamados fica por último, e qualquer falha nele só vai para o log.
  8. O motivo "prazo vencido" era aceito sem conferência; agora só fica registrado se o chamado está mesmo vencido.
  9. Complementar um chamado crítico já existente também transferia, com um resumo falso; agora só chamado novo transfere.
  10. Erros do sistema de chamados eram engolidos sem log, e o número do chamado se perdia; agora vão para o log e o número fica registrado.
  11. As tools de rascunho agiam depois de a conversa ter sido transferida no mesmo turno; agora recusam. A tela mostrava o analista como "Nexo Assist".
- **O que ficou, com o motivo:**
  - A troca de estado, o resumo e o aviso são três gravações locais em sequência, não uma transação única. Uma falha entre elas exigiria o banco local cair no meio. Os casos que de fato falham (o sistema de chamados) ficaram fora desse trecho.
  - A resposta do agent não é revalidada contra o estado no fim do turno. Depois de uma transferência, essa resposta é o próprio aviso ao funcionário e precisa ser gravada; o que importava era impedir ações, e isso as tools agora fazem.
- **Lição:** de novo, o revisor achou o que os testes do autor não pegavam, e alguns desses testes passavam por acaso. Conferir que um teste falha sem a correção passou a fazer parte das correções.

---

## T14: classificador e registro de decisão (30/10/2026)

### 46. T14: toda resposta do agent tem um registro de decisão
- **IA gerou:**
  - o classificador da etapa 1: um agent do Mastra com saída estruturada, que devolve intenção, o que entendeu, campos extraídos, confiança e porquê. Se ele falhar, o turno segue com confiança neutra, e o registro diz isso;
  - o registro de decisão (`decision-trace.ts`), uma função pura que junta a classificação, os passos do agent e as regras aplicadas pelo código (prioridade, nível de suporte);
  - sinais objetivos que reduzem a confiança, cada um com o motivo (R09, R40): central de ajuda sem artigo, campos faltando, mais de um duplicado, sistema de chamados falhando, ação que falhou;
  - a gravação por turno, ligada à mensagem, com o registro chegando à tela nos metadados.
- **Decisões tomadas pela IA, sem consultar o usuário:**
  - A classificação vai para o agent pela opção `system` do Mastra. O provedor do Gemini não aceita mensagem de sistema no meio da conversa, e colocá-la no texto do funcionário deixaria qualquer um forjar uma classificação.
  - O ADR-0010 já contava o classificador nas 3 chamadas por mensagem, então os tetos de uso não mudaram. *(Correção: a conta estava errada; ver o item 47.)*
  - Limiar inicial de 0,5, a calibrar na avaliação da T27.
- **O teste pegou um problema da central de ajuda (R13):** "Como calibro..." achava o artigo "Como instalar ou pedir um software" só pela palavra "como". As palavras de pergunta e de ligação passaram a ser ignoradas na busca, o que também melhora a detecção de duplicados.
- **O Gemini real pegou dois problemas** (cerca de 15 chamadas da cota gratuita):
  1. Para "meu computador tá esquisito", o agent montou um rascunho **inventando** a urgência e a descrição. O classificador passou a dar confiança baixa a problema sem detalhe, e o prompt proíbe deduzir urgência ou quem é afetado. Agora o agent pergunta "o que está acontecendo?".
  2. O limiar era aplicado depois da resposta: o agent fez uma pergunta com opções e a conversa foi transferida logo em seguida, deixando a pergunta sem ninguém para acompanhar. A decisão passou para antes do agent falar. A segunda mensagem seguida com confiança baixa vai para o analista com um aviso fixo, sem chamar o agent, o que também economiza uma chamada.
- **Validação final com o modelo real:** "qual o horário" saiu com confiança 0,9, sem sinais. A mensagem vaga gerou uma pergunta e, na segunda vaga, a transferência para o N2, com a regra R39 no registro. O pedido claro de abertura saiu com confiança 0,95 e rascunho Alta.
- **Fica para depois:** os tokens da etapa 2 (o agent) não são medidos ainda, porque o stream do Mastra não os expõe no ponto em que o turno é gravado. Ficam para a T16, junto com o teto de custo.

### 47. Revisão adversarial independente da T14
- **Como:** sub-agente novo, sem o contexto da implementação, com a skill `revisao-adversarial` sobre `19dc7f3..50c67ca`. Ele confirmou as hipóteses com testes temporários, usando o modelo de teste.
- **Resultado:** 5 importantes e 4 menores. As correções:
  1. A classificação leva segundos, e o modo da conversa só era conferido antes dela. Uma transferência nesse intervalo (por exemplo, o botão de um chamado crítico) deixava o agent responder com a conversa já com os analistas. Agora a conversa é conferida de novo depois do classificador.
  2. Depois de o analista devolver a conversa, a primeira mensagem vaga transferia de novo, sem o agent perguntar. O limiar passou a olhar só o mesmo período com o agent: o registro guarda a versão da conversa, que muda a cada transferência ou devolução.
  3. O limiar comparava a confiança final do turno anterior, já reduzida pelos sinais, com a do classificador no turno atual. E o agent só recebia a do classificador, rotulada "alta" em 0,6. Uma conversa normal de rascunho podia ir para o analista sem a pergunta exigida pela R39. Correções:
     - as duas pontas usam a confiança do classificador, que é o que o agent recebe;
     - o rótulo tem três faixas (alta, média e baixa), como no prompt do classificador.
  4. A conta de "até 3 chamadas por mensagem" do ADR-0010 estava errada: com duas tools e o classificador, um turno usa 4. A 5 mensagens por minuto, o 429 do provedor chegaria antes do teto da api. Correções:
     - o agent ganhou um máximo de 3 passos por resposta;
     - os tetos passaram para 3 mensagens por minuto e 120 por dia, no ADR, no README, no `.env.example` e no `.env` local.
  5. O "entendido" do classificador, que parafraseia o texto do funcionário, ia para o contexto de sistema do agent. Isso abria uma porta para injeção de instruções. Agora o agent recebe só a intenção e a confiança.
  6. Uma falha ao gravar o registro derrubava o aviso da transferência pelo limiar; agora a falha vai só para o log.
  7. Faltavam testes de:
     - transferência durante a classificação;
     - classificador fora do ar no fluxo completo;
     - falha ao gravar o registro;
     - conversa já transferida no limiar, que respondia "o agent responde" em vez de "pausa".
  8. Texto longo do classificador fazia perder a classificação inteira; agora é cortado.
  9. Contradições com a documentação:
     - os botões do card não gravavam o registro "ação determinística, confiança 100%" prometido no ADR-0006; agora gravam, e um clique zera a sequência do limiar;
     - duplicado e campos faltando apareciam como falha no registro; agora aparecem como passos normais.
- **O que ficou, com o motivo:**
  - O sinal "categoria ambígua" da R09 não foi implementado: o classificador devolve uma categoria só, sem alternativas para comparar. A calibração da T27 dirá se ele faz falta.
  - O teste de que o agent pergunta quando a confiança é baixa depende do prompt, e o modelo de teste não verifica isso. Foi conferido com o Gemini real (item 46) e entra na avaliação roteirizada da T27.
- **Lição:** o limiar parecia simples, mas tinha três problemas de desenho: a medida, o período e a corrida com outras ações. Nenhum aparecia nos testes do caminho feliz.

