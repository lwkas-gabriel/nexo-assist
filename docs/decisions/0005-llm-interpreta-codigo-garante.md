# ADR-0005: O LLM interpreta, o código garante as regras

**Status:** Aceita (29/10/2026)

## Contexto
O agent precisa seguir as regras do service desk (Anexo A): confirmar antes de criar, não expor chamados de outros funcionários, não responder enquanto a conversa está com um analista, e calcular prioridade e prazo corretamente. Um LLM segue instruções de forma probabilística e pode ser manipulado por prompt injection.

## Decisão
- O LLM entende a mensagem, extrai campos (tipo, categoria, impacto, urgência) e escolhe a próxima ação.
- O código decide tudo o que é regra, com funções puras e testadas: prioridade (RN11), prazo em horário útil (RN12/13), reabertura (RN06) e candidatos a duplicidade (RN05).
- As regras críticas são garantidas **por construção**, não por prompt:
  - **Confirmação (RN04):** o agent só propõe rascunhos. Criar ou atualizar passa pelo caso de uso `confirmDraft`, que exige rascunho pendente, desta conversa, não alterado, em turno disparado pelo funcionário.
  - **Pausa (RN08):** com a conversa com um analista, o servidor nem chama o LLM.
  - **Privacidade (RN09):** o dono vem da sessão; nenhuma tool aceita identificação de usuário vinda do modelo.

## Alternativas descartadas
- **Regras só no prompt:** mais simples, mas sem garantia e impossível de testar de forma determinística.

## Consequências
- As regras críticas têm testes unitários determinísticos.
- Prompt injection não consegue criar chamado nem ler dados de outro funcionário.
- Mais código de servidor em volta das tools.
