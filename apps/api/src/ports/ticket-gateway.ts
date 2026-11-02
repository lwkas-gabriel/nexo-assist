import type { TicketDto, UpdateAuthor } from "@nexo/shared/contracts";
import type { TicketDraft } from "@nexo/shared/domain";

/**
 * Sistema de chamados, do ponto de vista da api. Hoje é o serviço simulado (HTTP);
 * trocar por um sistema real é escrever outro adapter, sem mudar agent nem casos de uso.
 *
 * O dono (`ownerId`) vem sempre da sessão (RN09). Escritas recebem uma chave de idempotência:
 * repetir a operação com a mesma chave não a executa de novo (R01).
 */
export type TicketGateway = {
  listTickets(ownerId: string, filter: "open" | "all"): Promise<TicketDto[]>;
  getTicket(ownerId: string, number: string): Promise<TicketDto>;
  createTicket(ownerId: string, draft: TicketDraft, idempotencyKey: string): Promise<TicketDto>;
  addUpdate(
    ownerId: string,
    number: string,
    update: { author: UpdateAuthor; message: string },
    idempotencyKey: string,
  ): Promise<TicketDto>;
  reopenTicket(ownerId: string, number: string, idempotencyKey: string): Promise<TicketDto>;
  transferTicket(
    ownerId: string,
    number: string,
    summary: string,
    idempotencyKey: string,
  ): Promise<TicketDto>;
  /** A conversa voltou ao assistente; o chamado volta a "em andamento" (11.3). */
  releaseTicket(
    ownerId: string,
    number: string,
    analystName: string,
    idempotencyKey: string,
  ): Promise<TicketDto>;
  /** R31: um analista assumiu a conversa; o chamado fica "em atendimento". */
  assumeTicket(
    ownerId: string,
    number: string,
    analystName: string,
    idempotencyKey: string,
  ): Promise<TicketDto>;
};
