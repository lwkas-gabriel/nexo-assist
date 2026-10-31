# ADR-0007: Sessão de 30 mensagens com herança de contexto

**Status:** Aceita (29/10/2026)

## Contexto
O PRD limita o chat a 30 mensagens por sessão e também quer que o funcionário "volte outro dia e continue de onde parou". Se a sessão fosse a conversa inteira, quem volta esbarraria no limite para sempre (achado R03).

## Decisão
- Contam só as mensagens do funcionário tratadas pelo agent. Com a conversa com um analista, o contador congela.
- A sessão termina ao atingir 30 mensagens ou após 8 h sem atividade, **exceto** se a conversa estiver aguardando um analista ou em atendimento.
- A nova sessão mostra o histórico anterior, começa com um resumo curto e herda rascunhos e chamados pendentes.
- **Atualizado na T22 (31/10/2026):** "Encerrar atendimento", no console, também encerra a sessão: a conversa volta ao agent com uma sessão nova e o resumo, em vez de ser fechada de vez. Fechada, ela sairia da tela do funcionário (que só vê a conversa em aberto) e a próxima mensagem começaria outra conversa sem o histórico, contra o RF11. O chamado segue o próprio status (A08).

## Alternativas descartadas
- **Sessão = dia:** a conversa pode estourar o limite no meio do dia.
- **Sessão = login:** fácil de burlar, protege pouco o custo.

## Consequências
- O limite controla custo sem quebrar a continuidade.
- Exige gerar e guardar um resumo ao fechar cada sessão.
