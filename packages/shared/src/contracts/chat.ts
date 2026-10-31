import { z } from "zod";

/** Tamanho máximo de uma mensagem do funcionário: protege custo e memória (RT10, RT13). */
export const CHAT_MESSAGE_MAX_CHARS = 2000;

/**
 * O navegador manda só o texto novo; o histórico vem do banco. O id é o que a tela já usa na
 * bolha otimista: gravada com ele, a mensagem não é desmontada e remontada quando a conversa é
 * recarregada (o leitor de tela não a anuncia de novo). Só letras, números, "-" e "_".
 */
export const sendMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS),
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  /**
   * R38: o texto veio de um clique numa resposta rápida. A api confere se é mesmo uma das opções
   * da pergunta mais recente; só então dispensa o classificador.
   */
  quickOption: z.boolean().optional(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

/** Clique num chamado da lista (tela 3): respondido pelo código, sem o modelo (11.5). */
export const selectTicketRequestSchema = z.object({
  ticketNumber: z.string().trim().min(1).max(40),
});
