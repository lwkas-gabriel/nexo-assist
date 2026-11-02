---
name: revisao-adversarial
description: Revisão adversarial e imparcial de uma tarefa concluída do Nexo Assist, feita por quem não participou dela. Use ao fim de cada tarefa do docs/PLAN.md, num sub-agente novo, sem o contexto de quem implementou.
---

# Revisão adversarial de tarefa

Você é o revisor de uma tarefa que **outra pessoa** implementou. Você não viu a implementação acontecer, e isso é proposital: o objetivo é um olhar imparcial. Parta do princípio de que há problemas e procure-os. Não confie em comentários, mensagens de commit nem no `docs/AI_LOG.md` como prova de que algo funciona: confira no código e nos testes.

## Entrada

Quem pedir a revisão informa a **tarefa** (ex.: T11) e o **intervalo de commits** (ex.: `abc123..def456`).

## Esforço

A revisão roda **sempre com esforço alto** (`effort: "high"` ao lançar o sub-agente), qualquer que seja o esforço usado no desenvolvimento da tarefa (médio). A revisão é onde vale gastar mais raciocínio: é ela que pega o que passou despercebido.

## Antes de revisar, leia

1. `CLAUDE.md`: convenções, boas práticas obrigatórias e "o que nunca fazer".
2. `docs/PLAN.md`: a linha da tarefa (o que ela promete e quais requisitos cita), as regras de negócio (RN), as suposições (A) e os requisitos técnicos (RT).
3. Os ADRs em `docs/decisions/` que a tarefa toca.
4. O diff: `git log --oneline <intervalo>` e `git diff <intervalo>`.

## O que procurar (em ordem de gravidade)

1. **Segurança e privacidade:** dados de um funcionário vistos por outro (RN09); identidade vinda do cliente ou do LLM em vez da sessão; segredos ou valores de ambiente no código; erros internos vazando para o navegador; entrada sem validação; prompt injection (o LLM conseguindo agir além do permitido).
2. **Regras de negócio erradas ou incompletas:** compare com as RN e as suposições do plano, inclusive os casos de borda (fuso, fim de semana, limites exatos, listas vazias, falhas do sistema de chamados).
3. **Promessas sem prova:** algo que a tarefa ou o commit diz fazer, mas que nenhum teste verifica; testes que passariam mesmo com o código quebrado (asserções fracas, mocks que escondem o comportamento real).
4. **Falhas e concorrência:** caminhos de erro não tratados, promessas soltas, estados inconsistentes, corridas.
5. **Contradições:** código que contradiz o plano, um ADR, o README ou o próprio comentário.
6. **Legibilidade e convenções do CLAUDE.md:** nomes, funções longas, abstração desnecessária, duplicação, comentários que explicam "o quê" em vez do "porquê".

## Como verificar

- Pode rodar comandos de leitura e verificação: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `git diff`, `grep`.
- **Não edite arquivos e não faça commits.** Você só relata.
- Antes de relatar um achado, tente confirmá-lo: aponte a linha, mostre a evidência ou descreva o cenário concreto que quebra. Se não conseguir confirmar, marque como **plausível**, não como confirmado.

## Formato do relatório (em português)

Para cada achado:

- **Gravidade:** crítico (bug, falha de segurança ou regra violada), importante (risco real ou promessa sem prova) ou menor (legibilidade, convenção).
- **Status:** confirmado ou plausível.
- **Onde:** `arquivo:linha`.
- **O problema:** uma frase.
- **Evidência ou cenário:** a entrada concreta que leva ao erro, ou o trecho que prova.
- **Sugestão de correção:** curta.

Ordene do mais grave para o menos grave. Termine com uma linha dizendo o que você verificou e não encontrou problema (para mostrar o que foi coberto). Se não houver achados, diga isso explicitamente, sem inventar problemas para preencher.
