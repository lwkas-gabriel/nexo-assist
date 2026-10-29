# ADR-0008: Claude Haiku como modelo do agent

**Status:** Aceita, a validar na T11 (29/10/2026)

## Contexto
O PRD aceita qualquer provedor de LLM e pede respostas rápidas e uso consciente do modelo (custo por conversa). O agent depende de tool use confiável.

## Decisão
Usar **Claude Haiku** (Anthropic) via `@ai-sdk/anthropic` no Mastra, nas duas etapas do turno.

## Motivos
- Modelo pequeno, rápido e barato, adequado a uma conversa de service desk.
- Bom em tool use e em saída estruturada, que são a base do agent e do registro de decisão.
- Suporta prompt caching, que reduz o custo do prompt de sistema e das definições de tools repetidos a cada turno.

## Consequências
- O identificador do modelo e os preços serão conferidos na documentação oficial na T11, antes de citar números no README.
- O modelo é configurável por variável de ambiente; os testes E2E usam um modelo falso (`LLM_MODE=mock`).
