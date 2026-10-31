import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../ui/Button.tsx";
import { cx } from "../../../ui/cx.ts";
import { Skeleton } from "../../../ui/Feedback.tsx";
import { TICKET_STATUS_TONES, TONE_DOT_CLASSES } from "../../../ui/status-styles.ts";
import type { TicketSummaryView } from "../../chat/ticket-model.ts";
import type { ConsoleTickets } from "../console-api.ts";

/** Quantos "outros chamados" aparecem antes do "Ver todos" (R29: expande no próprio painel). */
const OTHERS_PREVIEW = 3;

const TONE_TEXT_CLASSES = {
  warning: "text-warning-text",
  danger: "text-danger-text",
  success: "text-success-text",
  primary: "text-primary-text",
  neutral: "text-ink-3",
} as const;

/**
 * RF21, tela 4: os chamados do funcionário da conversa: os desta conversa em destaque e os
 * outros numa lista que expande no próprio painel (R29). Aqui o vencido fica em danger (10.2).
 */
export function TicketHistoryPanel({
  data,
  isLoading,
  error,
}: {
  data: ConsoleTickets | undefined;
  isLoading: boolean;
  error: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Carregando chamados" className="flex flex-col gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="text-[13.5px] text-danger-text">
        {error ?? "Não consegui carregar os chamados."}
      </p>
    );
  }
  const firstName = data.employeeName.split(" ")[0];
  const others = showAll ? data.others : data.others.slice(0, OTHERS_PREVIEW);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-[12.5px] text-ink-3">
        {data.openCount} {data.openCount === 1 ? "aberto" : "abertos"} · {data.closedCount}{" "}
        {data.closedCount === 1 ? "encerrado" : "encerrados"}
      </p>
      <section aria-labelledby="tickets-this" className="flex flex-col gap-3">
        <h3 id="tickets-this" className="text-[12.5px] font-semibold text-ink-3">
          Desta conversa
        </h3>
        {data.thisConversation.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">Nenhum chamado ligado a esta conversa.</p>
        ) : (
          data.thisConversation.map((ticket) => (
            <CurrentTicket key={ticket.number} ticket={ticket} />
          ))
        )}
      </section>
      <section aria-labelledby="tickets-others" className="flex flex-col gap-1">
        <h3 id="tickets-others" className="text-[12.5px] font-semibold text-ink-3">
          Outros chamados
        </h3>
        {data.others.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">Nenhum outro chamado.</p>
        ) : (
          <ul className="flex flex-col">
            {others.map((ticket) => (
              <OtherTicket key={ticket.number} ticket={ticket} />
            ))}
          </ul>
        )}
        {data.others.length > OTHERS_PREVIEW && (
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Mostrar menos" : `Ver todos os chamados de ${firstName}`}
          </Button>
        )}
      </section>
    </div>
  );
}

function statusTone(ticket: TicketSummaryView) {
  return ticket.isOpen && ticket.deadline?.isOverdue
    ? "danger"
    : TICKET_STATUS_TONES[ticket.statusCode];
}

function CurrentTicket({ ticket }: { ticket: TicketSummaryView }) {
  const tone = statusTone(ticket);
  return (
    <article className="flex flex-col gap-3.5 rounded-xl bg-desk p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[12.5px] font-medium text-ink-3">{ticket.number}</span>
          {/* 10.7: a etiqueta colorida ganha fundo paper próprio sobre o card em desk. */}
          <span
            className={cx(
              "flex items-center gap-1.5 rounded-full bg-paper px-2 py-0.5 text-[12.5px] font-semibold",
              TONE_TEXT_CLASSES[tone],
            )}
          >
            <span aria-hidden className={cx("size-[7px] rounded-full", TONE_DOT_CLASSES[tone])} />
            {ticket.status}
          </span>
        </div>
        <h4 className="text-[15.5px] font-semibold text-ink">{ticket.title}</h4>
        <p className="text-[13.5px] text-ink-3">
          {ticket.category} · prioridade {ticket.priority.toLowerCase()}
        </p>
      </div>
      {ticket.isOpen && ticket.deadline && (
        <p className="flex items-center gap-2 border-t border-rule pt-3 text-[13.5px] text-ink-2">
          <ArrowRightLeft aria-hidden size={15} className="text-ink-3" />
          <span className="flex-1">
            {ticket.deadline.isOverdue ? "Prazo vencido" : "Prazo"} ({ticket.deadline.rule}):{" "}
            {ticket.deadline.dueAt}
          </span>
        </p>
      )}
    </article>
  );
}

function OtherTicket({ ticket }: { ticket: TicketSummaryView }) {
  const tone = statusTone(ticket);
  return (
    <li className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0">
      <span
        aria-hidden
        className={cx("size-[7px] shrink-0 rounded-full", TONE_DOT_CLASSES[tone])}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[14.5px] font-medium text-ink">{ticket.title}</span>
        <span className="text-[12.5px] text-ink-3">
          {ticket.number} · {ticket.status}
          {ticket.isOpen && ticket.deadline?.isOverdue && " · prazo vencido"}
        </span>
      </span>
    </li>
  );
}
