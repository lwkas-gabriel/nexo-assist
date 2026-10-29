# ADR-0006: Turno em duas etapas e ações determinísticas para cliques

**Status:** Aceita (29/10/2026)

## Contexto
A transparência é a parte mais importante do desafio: cada resposta precisa mostrar o que o agent entendeu, que ação tomou, com que confiança e por quê. Pedir ao modelo que "registre a decisão no fim" não dá garantia, porque ele pode pular a etapa. Ao mesmo tempo, custo e latência por conversa são avaliados.

## Decisão
- **Texto livre** passa por duas etapas:
  1. **Classificador** com saída estruturada (intenção, campos extraídos, confiança, justificativa), sempre presente.
  2. **Agent** com tools, que recebe a classificação.

  O registro de decisão junta as duas etapas. A confiança final é ajustada por sinais determinísticos (campo faltando, mais de um candidato a duplicidade, central de ajuda sem resultado).
- **Cliques** (selecionar chamado, Confirmar, Cancelar, "Falar com um analista") enviam uma ação estruturada e são tratados por código, **sem chamar o LLM**. O registro marca "ação determinística".
- Confiança baixa leva primeiro a uma pergunta de esclarecimento; a conversa só é transferida para um analista se a confiança continuar baixa.

## Alternativas descartadas
- **Tool obrigatória de registro numa chamada só:** mais barata, mas sem garantia.
- **Tudo pelo LLM, inclusive cliques:** mais caro, mais lento e sujeito a interpretar errado algo que já está determinado.

## Consequências
- Até duas chamadas ao LLM por mensagem de texto, mitigadas com modelo pequeno e prompt caching. Tokens e latência são gravados por turno e reportados no README.
- Dois caminhos de tratamento, separados de forma explícita no código.
