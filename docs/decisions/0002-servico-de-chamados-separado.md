# ADR-0002: Serviço de chamados como app separado, com banco próprio

**Status:** Aceita (29/10/2026)

## Contexto
O PRD pede um serviço de chamados simulado **separado do agent** e diz que o sistema real é legado e às vezes fica indisponível por alguns segundos.

## Decisão
- `apps/tickets-service` é um servidor HTTP próprio, com banco próprio (`tickets.db`). A api só o acessa por HTTP, através da porta `TicketGateway`.
- Ele simula o legado com um middleware de falhas configurável (taxa e latência por variável de ambiente).
- O acesso é protegido por token de serviço; em produção, o serviço fica só na rede privada.
- Toda escrita aceita **chave de idempotência**, para o retry nunca duplicar chamados (achado R01 da revisão).

## Alternativas descartadas
- **Módulo dentro da api:** mais simples, mas a separação viraria só convenção e a instabilidade de rede não seria simulada de forma realista.

## Consequências
- Trocar o simulado por um sistema real é escrever outro adapter da porta `TicketGateway`; agent e casos de uso não mudam.
- A api precisa tratar timeout, retry com backoff e indisponibilidade de forma honesta para o usuário.
- Não há transação entre os dois bancos: a consistência vem da idempotência.
