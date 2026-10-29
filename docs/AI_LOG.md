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
