import { EmptyState } from "../../../ui/Feedback.tsx";
import type { EmptyTicketList as EmptyTicketScope } from "../ticket-model.ts";

const EMPTY_TICKET_TITLES: Record<EmptyTicketScope, string> = {
  open: "Você não tem chamados abertos",
  all: "Você não tem chamados",
};

/** Lista de chamados vazia (10.5): um cartão leve no lugar do seletor que não há o que mostrar. */
export function EmptyTicketList({ scope }: { scope: EmptyTicketScope }) {
  return (
    <div className="max-w-[600px] rounded-lg border border-rule bg-paper">
      <EmptyState isCompact title={EMPTY_TICKET_TITLES[scope]} />
    </div>
  );
}
