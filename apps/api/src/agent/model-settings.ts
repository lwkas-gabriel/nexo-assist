/**
 * Tentativas numa falha passageira do provedor: uma nova tentativa, no total 2. Mais que isso só
 * atrasa o aviso quando a cota por minuto acabou, e gasta cota (ADR-0010).
 *
 * O Mastra repete em duas camadas que se multiplicam: o `maxRetries` do agent e um processador de
 * erros com teto próprio (`maxProcessorRetries`, padrão 2). Sem zerar o segundo, `maxRetries: 1`
 * vira 6 tentativas. Medido com um modelo que sempre falha; `chat-model-calls.test.ts` conta.
 * `modelSettings.maxRetries` na chamada não muda nada nesta versão do Mastra.
 */
export const RETRY_SETTINGS = { maxRetries: 1, maxProcessorRetries: 0 } as const;
