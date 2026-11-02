import { cx } from "../../../ui/cx.ts";
import { TICKET_STATUS_TONES, TONE_DOT_CLASSES } from "../../../ui/status-styles.ts";
import { isOverdueAndOpen, type TicketSummaryView } from "../ticket-model.ts";

/**
 * RF08, tela 3: os chamados do funcionário para escolher um, sem precisar lembrar o número.
 * O clique é uma ação estruturada, respondida pelo código (11.5). Só a lista mais recente aceita
 * escolha; as antigas ficam como registro.
 */
export function TicketPickerList({
  tickets,
  isActive,
  onSelect,
}: {
  tickets: readonly TicketSummaryView[];
  isActive: boolean;
  onSelect: (ticket: TicketSummaryView) => void;
}) {
  return (
    <ul
      aria-label="Seus chamados"
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-card"
    >
      {tickets.map((ticket) => {
        // A cor é do status, como no protótipo; o vencimento vem escrito ao lado (RN12).
        const tone = TICKET_STATUS_TONES[ticket.statusCode];
        return (
          <li key={ticket.number} className="border-b border-rule last:border-b-0">
            <button
              type="button"
              disabled={!isActive}
              onClick={() => onSelect(ticket)}
              className={cx(
                "flex min-h-[46px] w-full flex-wrap items-center gap-x-3.5 gap-y-1 px-4 py-2 text-left",
                "enabled:hover:bg-primary-soft/40 disabled:cursor-default",
              )}
            >
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full border border-line-strong bg-paper"
              />
              <span className="text-[12.5px] font-medium text-ink-3">{ticket.number}</span>
              <span className="min-w-0 flex-1 basis-40 text-[14.5px] font-medium text-ink">
                {ticket.title}
              </span>
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <span aria-hidden className={cx("size-1.5 rounded-full", TONE_DOT_CLASSES[tone])} />
                {ticket.status}
                {isOverdueAndOpen(ticket) && (
                  <span className="font-medium text-warning-text">· prazo vencido</span>
                )}
              </span>
              <span className="w-11 text-right text-[12.5px] text-ink-3">
                <span className="sr-only">aberto em </span>
                {ticket.openedOn}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
