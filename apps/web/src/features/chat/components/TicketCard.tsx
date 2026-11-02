import type { ReactNode } from "react";
import { Card } from "../../../ui/Card.tsx";
import { cx } from "../../../ui/cx.ts";
import {
  TICKET_STATUS_TONES,
  TONE_DOT_CLASSES,
  priorityDotClass,
} from "../../../ui/status-styles.ts";
import { isOverdueAndOpen, type TicketDetailsView } from "../ticket-model.ts";

/** Texto do status no tom do ponto (tela 3: "Aguardando analista" em aviso). */
const TONE_TEXT_CLASSES = {
  warning: "text-warning-text",
  danger: "text-danger-text",
  success: "text-success-text",
  primary: "text-primary-text",
  neutral: "text-ink-3",
} as const;

/**
 * RF09, tela 3: o chamado consultado, com o status, a prioridade, quando foi aberto e há quanto
 * tempo a TI não responde. Vencido (RN12), o tempo fica em aviso, com "prazo vencido" ao lado.
 */
export function TicketCard({ ticket }: { ticket: TicketDetailsView }) {
  // O status na cor dele, como no protótipo; o vencimento aparece em "Última atualização".
  const tone = TICKET_STATUS_TONES[ticket.statusCode];
  const overdue = isOverdueAndOpen(ticket);

  return (
    <Card className="overflow-hidden">
      <section aria-label={`Chamado ${ticket.number}`}>
        <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-0.5 text-[12.5px] whitespace-nowrap text-ink-3">
            <span className="font-medium">Chamado</span>
            <span aria-hidden className="size-[3px] rounded-full bg-rule" />
            <span>{ticket.number}</span>
            <span
              className={cx(
                "ml-auto flex items-center gap-1.5 font-medium",
                TONE_TEXT_CLASSES[tone],
              )}
            >
              <span aria-hidden className={cx("size-1.5 rounded-full", TONE_DOT_CLASSES[tone])} />
              {ticket.status}
            </span>
          </div>
          <h3 className="text-lg leading-[1.25] font-semibold tracking-[-0.2px] text-ink">
            {ticket.title}
          </h3>
          <p className="text-[13.5px] leading-normal text-ink-2">{ticket.description}</p>
        </div>
        <div className="px-[18px] pb-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 md:grid-cols-4">
            <Field label="Categoria">{ticket.category}</Field>
            <Field label="Prioridade">
              <span
                aria-hidden
                className={cx("size-1.5 rounded-full", priorityDotClass(ticket.priority))}
              />
              {ticket.priority}
            </Field>
            <Field label="Aberto em">{ticket.openedAt}</Field>
            <Field label="Última atualização">
              {ticket.isOpen ? (
                <>
                  <span className={overdue ? "text-warning-text" : undefined}>
                    {ticket.lastTeamUpdateAt
                      ? `há ${ticket.timeWithoutTeamResponse}`
                      : `sem resposta há ${ticket.timeWithoutTeamResponse}`}
                  </span>
                  {overdue && (
                    <span className="text-[13.5px] font-normal text-ink-3">· prazo vencido</span>
                  )}
                </>
              ) : (
                (ticket.lastTeamUpdateAt ?? "—")
              )}
            </Field>
          </dl>
        </div>
      </section>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-medium text-ink">
        {children}
      </dd>
    </div>
  );
}
