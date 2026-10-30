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
