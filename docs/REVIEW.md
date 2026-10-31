# Nexo Assist — Revisões adversariais do plano

> **Mapa da documentação.** As seções mantêm a numeração do plano original para que as referências cruzadas (ex.: "ver 10.6", "R03", "A12") continuem válidas:
> [PLAN.md](PLAN.md) — seções 1–4, 6–8 e 12 (requisitos, suposições, tarefas) ·
> [ARCHITECTURE.md](ARCHITECTURE.md) — seções 5 e 11 (arquitetura, segurança, backend) ·
> [FRONTEND.md](FRONTEND.md) — seção 10 (telas, componentes, responsividade) ·
> [REVIEW.md](REVIEW.md) — seção 9 (revisões adversariais R01–R47) ·
> [AI_LOG.md](AI_LOG.md) — registro do uso de IA

## 9. Revisão adversarial do plano
Objetivo: achar o que quebraria, causaria retrabalho ou contradiz o próprio plano. Status: **[corrigir]** = ajuste claro, entra no plano; **[decidir]** = precisa da escolha do usuário.

### Críticos (bug ou retrabalho garantido se ignorados)
| # | Problema | Por que quebra | Ajuste |
|---|---|---|---|
| R01 | **Retry em escrita no legado instável** | O POST "criar chamado" pode criar o chamado e dar timeout na resposta. O retry cria outro: **duplicidade causada por nós**, exatamente o que RN05 proíbe | **[corrigir]** Chave de idempotência em toda escrita (`draftId` para criar/atualizar); o tickets-service guarda a chave e devolve o mesmo resultado. Teste com falha injetada *depois* do commit |
| R02 | **Fuso horário** | O Railway roda em UTC. "8h–18h", "resposta até 13:43" e "há 5 dias" sairiam errados em 3 horas | **[corrigir]** Todo cálculo de horário útil em `America/Sao_Paulo`; datas guardadas em UTC; testes com virada de dia, sexta → segunda e 17h + 4 h úteis |
| R03 | **Limite de 30 mensagens × "voltar outro dia e continuar"** | Se a sessão for a conversa inteira, quem volta outro dia esbarra no limite para sempre. A05 e RF11 se contradizem | **[decidido]** Sessão termina em 30 mensagens do funcionário ou após 8 h de inatividade. A nova sessão exibe o histórico anterior, começa com um resumo curto (gerado ao fechar a anterior) e herda rascunhos e chamados pendentes. A05 atualizada |
| R04 | **Confirmar digitando** | O mock tem botão e atalho ⌘↵, mas o funcionário vai digitar "pode criar". Se só o clique vale, a conversa trava; se o LLM confirma, perde-se a garantia da RN04 | **[decidido]** Tool `confirm_draft(draftId)`. O servidor só aceita se: o rascunho é desta conversa, está pendente, não foi alterado depois de exibido (hash) e o turno foi disparado por mensagem do funcionário. Botão, ⌘↵ e texto usam o mesmo caso de uso. Testes cobrindo cada recusa |
| R05 | **Registro de decisão "ao final do turno" não tem garantia** | O modelo pode pular uma tool de registro; um segundo chamado ao LLM dobra custo e latência | **[decidido]** Duas etapas por turno: (1) **classificador** com saída estruturada (intenção, campos extraídos, confiança, porquê), sempre presente; (2) **agent** com tools, recebendo a classificação. Custo controlado com Haiku + prompt caching; medir tokens e latência por turno e reportar no README |
| R06 | **Concorrência** | Dois analistas clicam "Assumir" juntos; o funcionário manda mensagem enquanto o agent ainda responde ou durante a transferência; duas abas abertas | **[corrigir]** "Assumir" atômico (`UPDATE ... WHERE assignee IS NULL`); um turno do agent por conversa por vez (fila/lock por conversa); coluna `version` no estado da conversa; o estado é revalidado antes de gravar a resposta do agent |
| R07 | **Ordem das tarefas: risco no fim** | Agent, streaming, transparência e deploy (o que mais pesa na nota e o mais incerto: Mastra muda rápido) só aparecem depois de 10 tarefas de infraestrutura | **[corrigir]** Nova T02b, um **esqueleto ponta a ponta**: login fake → chat → agent com 1 tool → streaming → chip → deploy no Railway. Valida stack e deploy no 3º passo |
| R08 | **Seed "envelhece" no deploy** | Avaliadores testam dias depois: o chamado "resolvido há 4 dias" passa de 7 dias e o cenário de reabertura some. Vários avaliadores usam a mesma "Ana" e se atrapalham | **[corrigir]** Comando `db:reset` + reseed automático a cada deploy; endpoint de reset protegido por token, documentado no README; avisar no README que a base de demo é compartilhada |

### Importantes (qualidade e coerência)
| # | Problema | Ajuste |
|---|---|---|
| R09 | Confiança autodeclarada pelo LLM é mal calibrada; limiar 0,6 é arbitrário | **[corrigir]** Confiança = nota do modelo **ajustada por sinais determinísticos** (campo obrigatório faltando, mais de um candidato a duplicidade, KB sem resultado, categoria ambígua); cada sinal aparece no detalhe como motivo. Limiar calibrado na avaliação T27. README honesto sobre a limitação |
| R10 | SSE próprio + cards (rascunho, seleção, opções) = reinventar um protocolo de mensagens com partes | **[corrigir]** Usar o protocolo de stream de UI do AI SDK (`useChat` + partes de tool), que o Mastra suporta, com a persistência no nosso banco. Confirmar compatibilidade de versões no T02b |
| R11 | `packages/domain` + `packages/contracts` separados é cerimônia para o tamanho do projeto | **[corrigir]** Um único `packages/shared` com `domain/` e `contracts/` |
| R12 | E2E "com LLM mockado": nada no plano permite trocar o modelo | **[corrigir]** Modelo injetado via config (`LLM_MODE=mock` usa um modelo falso roteirizado do AI SDK). A avaliação T27 usa o modelo real, roda manualmente (custa tokens), fora do CI |
| R13 | Busca por palavras-chave em PT perde "conecta" × "conexão" e acentos, e o agent abre chamado à toa (fere "resolução sem fila") | **[corrigir]** Normalizar acentos, stemming simples e sinônimos; a tool devolve top-3 com score. Casos de dúvida na T27 |
| R14 | Duplicidade entre funcionários (pane de VPN afeta 30 pessoas) não é tratada, e a privacidade impede mostrar o chamado alheio | **[corrigir]** Nova suposição **A16**: duplicidade verificada só entre chamados do próprio funcionário; incidente coletivo vira "afeta minha equipe/empresa" → Crítica → transferência |
| R15 | "Atualização" que zera o prazo é indefinida: um comentário do funcionário zera o SLA? | **[corrigir]** Nova suposição **A17**: o prazo conta da última atualização **da equipe de TI** (ou da abertura); complemento do funcionário não zera |
| R16 | Fluxos "Editar" e "Cancelar" do rascunho e "Adicionar informação" não estão definidos | **[corrigir]** Editar = campos do card viram editáveis (determinístico, sem LLM), com validação RN03; Cancelar = descarta o rascunho e registra no trace; Adicionar informação = gera rascunho de atualização |
| R17 | Resumo da transferência: de onde vem? | **[corrigir]** Argumento obrigatório da tool `handoff_to_analyst` (o próprio agent escreve, sem chamada extra), com estrutura fixa: problema, o que já foi tentado, chamados ligados, motivo da transferência |
| R18 | "Devolver ao agent": o agent responde na hora? Vê as mensagens do analista? | **[corrigir]** Não responde até a próxima mensagem do funcionário; as mensagens do analista entram no histórico do agent, marcadas como "analista" |
| R19 | Dev local com Vite em outra porta quebra o same-origin dos cookies | **[corrigir]** Proxy do Vite para `/api` no dev |
| R20 | Custo: prompt de sistema e regras reenviados a cada turno | **[corrigir]** Prompt caching da Anthropic no prompt de sistema e nas definições das tools; medir tokens por conversa e citar no README |

### Menores
- R21 O Railway não tem plano gratuito (2 serviços consomem crédito). Avisar no README e manter alternativa local.
- R22 O mock é só desktop (1440 px), com larguras fixas. Resolvido em 10.6 (breakpoints) e A18.
- R23 Redirecionamento fora de escopo precisa de destinos: criar artigos "Contatos de RH, Financeiro e Facilities" na KB.
- R24 Traces e mensagens guardam dados pessoais: registrar retenção como "o que faria com mais tempo".
- R25 Nada fixa versões do Mastra/AI SDK: fixar versões exatas e consultar a documentação na T02b.

### Efeito nas tarefas
- T01 passa a usar `packages/shared` (R11).
- Entra **T02b — Esqueleto ponta a ponta + deploy** (R07, R10, R25).
- T04 inclui fuso e casos de borda (R02); T08 inclui idempotência (R01); T09 inclui `version` e lock por conversa (R06); T07 inclui `db:reset` e reseed no deploy (R08).
- T12 inclui Editar/Cancelar/Adicionar informação (R16); T13 inclui resumo estruturado e devolução (R17, R18); T14 segue a escolha da pergunta 3 (R05, R09).
- T28 depende de `LLM_MODE=mock` (R12).

### Rodada 2: telas × plano
| # | Achado | Ajuste |
|---|---|---|
| R26 | O card de rascunho do mock **não mostra o Tipo** (INC/REQ), que a RN03 exige | **[corrigir]** DraftCard mostra Tipo junto de Categoria/Prioridade/Afetados. Nova suposição **A19** |
| R27 | O mock não mostra o lado do funcionário durante a transferência e o atendimento humano | **[corrigir]** Estados desenhados em 10.5 |
| R28 | No console, as mensagens do agent não têm chips, mas o analista precisa entender por que recebeu a conversa (história 2 do analista) | **[corrigir]** ActionChips + DecisionPanel reutilizados no console |
| R29 | "Ver todos os chamados da Ana" aponta para uma tela inexistente | **[corrigir]** Expande no próprio painel |
| R30 | O mock mostra confirmação de leitura (✓✓), "digitando…" e "online" | **[corrigir]** Suposição **A20**: "online" = funcionário fez polling nos últimos 60 s (barato); ✓ entregue / ✓✓ lida quando o analista abre a conversa; "digitando…" fora do escopo (documentado) **Ajustado na T23:** ✓✓ = o funcionário viu o que o agent ou o analista mandou; a leitura do analista conta as não lidas. |
| R31 | Ao assumir, o chamado muda para "Em atendimento" (tela 5): status de chamado e conversa estão acoplados | **[corrigir]** Máquinas de estado explícitas (11.3); "assumir" atualiza o chamado vinculado. A12 inclui "Em atendimento" |
| R32 | O console mostra o setor ("Financeiro") e o nível ("Suporte N2") | **[corrigir]** Campos `setor` e `nível` no seed de usuários |
| R33 | Atalho ⌘↵ não existe no Windows | **[corrigir]** Ctrl+Enter no Windows/Linux, ⌘+Enter no Mac; o Kbd mostra conforme o SO |
| R34 | Opções numeradas sugerem atalho de teclado | **[corrigir]** Teclas 1–4 quando o campo de texto está vazio |
| R35 | "resposta até 13:43" é calculado no rascunho; se a confirmação vier 20 min depois, o prazo muda | **[corrigir]** Prazo recalculado ao confirmar; se mudar, o card criado mostra o valor novo |
| R36 | "Disponível" do analista e "contato em 25 min" | **[corrigir]** Disponível é só visual, salvo no perfil (A21); a contagem regressiva é recalculada no cliente a cada minuto |
| R37 | O mock não mostra contas de demonstração; o avaliador não sabe com que e-mail entrar | **[corrigir]** Bloco discreto "Contas de demonstração" abaixo do formulário (A22), também listadas no README |

### Rodada 3: backend × requisitos não funcionais
| # | Achado | Ajuste |
|---|---|---|
| R38 | Clicar numa opção chamava o LLM duas vezes (classificador + agent) para algo já determinado | **[corrigir]** Ações estruturadas com handlers determinísticos (11.5) |
| R39 | Confiança baixa → transferência imediata faria o agent transferir demais, contra "pergunta quando falta informação" | **[corrigir]** Confiança baixa → primeiro **uma pergunta de esclarecimento**; transfere se continuar baixa ou se a ação for de alto impacto (crítico) |
| R40 | O classificador roda antes das tools, então sinais como "KB sem resultado" ainda não existem quando ele dá a confiança | **[corrigir]** Confiança final = classificador ajustado pelos sinais **depois** da etapa do agent; as duas aparecem no detalhe |
| R41 | A sessão expiraria por inatividade com a conversa ainda com analista | **[corrigir]** Sessão não expira em `waiting_analyst`/`analyst` (11.3) |
| R42 | O limite de 30 contaria mensagens trocadas com o analista | **[corrigir]** Conta só mensagens tratadas pelo agent; com analista, o contador congela |
| R43 | Prompt injection indireta: a descrição de um chamado ou um artigo pode conter instruções | **[corrigir]** Saídas de tools entram delimitadas como dados, com instrução no prompt; caso de teste na T27 |
| R44 | Mensagem de login para e-mail desconhecido | **[corrigir]** Mensagem genérica ("e-mail ou senha inválidos"); normalizar e-mail (minúsculas, espaços) |
| R45 | Uma conversa pode envolver vários chamados; o painel "Desta conversa" precisa saber quais | **[corrigir]** Tabela `conversation_tickets` (11.4) |
| R46 | A central de ajuda no banco é opaca para revisão | **[corrigir]** Artigos em Markdown versionado (11.4) |
| R47 | O dev é no Windows: scripts com `rm -rf`/`export` quebram; gitleaks não é pacote npm | **[corrigir]** Scripts cross-platform; gitleaks obrigatório no CI e opcional no pre-commit local (instruções no README) |

### Rodada 4: verificação final
Revisei as correções das rodadas 1–3 entre si. Não surgiram contradições novas. Restam só pontos cosméticos ou de escopo já documentados (digitando…, feriados, retenção de dados). **Encerro aqui as rodadas adversariais.** Nenhuma pendência aberta: idioma do código e escopo de responsividade decididos.

