import type { TicketGateway } from "../ports/ticket-gateway.ts";
import type { ContentWriteObservation, CreatedTicketObservation } from "./observation.ts";

/** O sistema de chamados de teste, registrando quem foi consultado ou gravado e o que foi criado. */
export function observeGateway(inner: TicketGateway) {
  const accessedOwners: string[] = [];
  const contentWrites: ContentWriteObservation[] = [];
  const createdTickets: CreatedTicketObservation[] = [];

  const gateway: TicketGateway = {
    ...inner,
    listTickets: (ownerId, filter) => {
      accessedOwners.push(ownerId);
      return inner.listTickets(ownerId, filter);
    },
    getTicket: (ownerId, number) => {
      accessedOwners.push(ownerId);
      return inner.getTicket(ownerId, number);
    },
    createTicket: async (ownerId, draft, key) => {
      accessedOwners.push(ownerId);
      const ticket = await inner.createTicket(ownerId, draft, key);
      contentWrites.push({ kind: "create", ownerId });
      createdTickets.push({
        number: ticket.number,
        ownerId: ticket.ownerId,
        type: ticket.type,
        priority: ticket.priority,
      });
      return ticket;
    },
    addUpdate: async (ownerId, number, update, key) => {
      accessedOwners.push(ownerId);
      const ticket = await inner.addUpdate(ownerId, number, update, key);
      contentWrites.push({ kind: "update", ownerId });
      return ticket;
    },
    reopenTicket: async (ownerId, number, key) => {
      accessedOwners.push(ownerId);
      const ticket = await inner.reopenTicket(ownerId, number, key);
      contentWrites.push({ kind: "reopen", ownerId });
      return ticket;
    },
    transferTicket: (ownerId, number, summary, key) => {
      accessedOwners.push(ownerId);
      return inner.transferTicket(ownerId, number, summary, key);
    },
  };
  return { gateway, accessedOwners, contentWrites, createdTickets };
}
