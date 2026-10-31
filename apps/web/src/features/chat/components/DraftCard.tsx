import {
  AFFECTED_SCOPES,
  AFFECTED_SCOPE_LABELS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  URGENCY_LABELS,
  URGENCY_LEVELS,
} from "@nexo/shared/domain";
import { useState, type FormEvent, type ReactNode } from "react";
import { isMacPlatform, modifierKeyLabel } from "../../../lib/platform.ts";
import { Button } from "../../../ui/Button.tsx";
import { Card } from "../../../ui/Card.tsx";
import { cx } from "../../../ui/cx.ts";
import type { DraftFields, DraftView } from "../chat-api.ts";

type DraftCardProps = {
  draft: DraftView;
  /** Só o rascunho mais recente aceita ação; os outros ficam como registro. */
  isActionable: boolean;
  isWorking: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: (changes: Partial<DraftFields>) => void;
};

const STATE_LABELS: Record<DraftView["status"], { label: string; dot: string; text: string }> = {
  pending: { label: "Aguardando confirmação", dot: "bg-warning", text: "text-warning-text" },
  confirming: { label: "Confirmando…", dot: "bg-primary", text: "text-primary-text" },
  confirm_failed: { label: "Não concluiu", dot: "bg-danger", text: "text-danger-text" },
  confirmed: { label: "Criado", dot: "bg-success", text: "text-success-text" },
  cancelled: { label: "Cancelado", dot: "bg-ink-3", text: "text-ink-3" },
};

const KIND_LABELS: Record<DraftView["kind"], string> = {
  create: "Novo chamado",
  update: "Complemento",
  reopen: "Reabertura",
};

/** Cor do ponto da prioridade, como no protótipo. */
const PRIORITY_DOTS: Record<string, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warning",
  Média: "bg-primary",
  Baixa: "bg-ink-3",
};

/**
 * Card do rascunho (RF07, tela 2): o funcionário confere antes de qualquer coisa ser criada
 * (RN04). Mostra o Tipo, que o protótipo omitia (R26), e o prazo calculado agora (R35).
 */
export function DraftCard(props: DraftCardProps) {
  const { draft, isActionable } = props;
  const [isEditing, setIsEditing] = useState(false);
  const state = STATE_LABELS[draft.status];
  const canAct = isActionable && (draft.status === "pending" || draft.status === "confirm_failed");
  const statusLabel =
    draft.status === "confirmed" && draft.ticketNumber
      ? `${state.label} · ${draft.ticketNumber}`
      : state.label;

  return (
    <Card className="overflow-hidden">
      <section aria-label={`Rascunho ${draft.draftId}`}>
        <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-0.5 text-[12.5px] whitespace-nowrap text-ink-3">
            <span className="font-medium">{KIND_LABELS[draft.kind]}</span>
            <span aria-hidden className="size-[3px] rounded-full bg-rule" />
            <span>Rascunho {draft.draftId}</span>
            <span className={cx("ml-auto flex items-center gap-1.5 font-medium", state.text)}>
              <span aria-hidden className={cx("size-1.5 rounded-full", state.dot)} />
              {statusLabel}
            </span>
          </div>
          {draft.ticket ? (
            <>
              <h3 className="text-lg leading-[1.25] font-semibold tracking-[-0.2px] text-ink">
                {draft.ticket.title}
              </h3>
              <p className="text-[13.5px] leading-normal text-ink-2">{draft.ticket.description}</p>
            </>
          ) : (
            <>
              <h3 className="text-lg leading-[1.25] font-semibold tracking-[-0.2px] text-ink">
                {draft.kind === "reopen" ? "Reabrir" : "Complementar"} o chamado{" "}
                <span className="font-data">{draft.ticketNumber}</span>
              </h3>
              <p className="text-[13.5px] leading-normal text-ink-2">{draft.update?.message}</p>
            </>
          )}
        </div>

        {draft.ticket && !isEditing && <DraftFieldsGrid ticket={draft.ticket} />}
        {draft.fields && isEditing && (
          <DraftEditForm
            fields={draft.fields}
            isWorking={props.isWorking}
            onSave={(changes) => {
              props.onEdit(changes);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        )}

        {props.error && (
          <p role="alert" className="px-[18px] pb-3 text-[13px] text-danger-text">
            {props.error}
          </p>
        )}

        {canAct && !isEditing && (
          <div className="flex items-center gap-1.5 border-t border-rule bg-desk py-2 pr-3.5 pl-2">
            <Button onClick={props.onConfirm} disabled={props.isWorking}>
              {draft.status === "confirm_failed" ? "Tentar de novo" : "Confirmar"}
              <kbd
                aria-hidden
                className="rounded-sm bg-paper/15 px-[5px] py-px text-[11.5px] font-normal text-paper/80"
              >
                {`${modifierKeyLabel(isMacPlatform())}↵`}
              </kbd>
            </Button>
            {draft.status === "pending" && draft.fields && (
              <Button
                variant="secondary"
                onClick={() => setIsEditing(true)}
                disabled={props.isWorking}
              >
                Editar
              </Button>
            )}
            {draft.status === "pending" && (
              <Button variant="ghost" onClick={props.onCancel} disabled={props.isWorking}>
                Cancelar
              </Button>
            )}
          </div>
        )}
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

function DraftFieldsGrid({ ticket }: { ticket: NonNullable<DraftView["ticket"]> }) {
  return (
    <div className="px-[18px] pb-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 md:grid-cols-4">
        <Field label="Tipo">{ticket.type}</Field>
        <Field label="Categoria">{ticket.category}</Field>
        <Field label="Prioridade">
          <span
            aria-hidden
            className={cx("size-1.5 rounded-full", PRIORITY_DOTS[ticket.priority] ?? "bg-ink-3")}
          />
          {ticket.priority}
          <span className="text-[13.5px] font-normal text-ink-3">
            · resposta até {ticket.firstResponseBy}
          </span>
        </Field>
        <Field label="Afetados">{ticket.affected}</Field>
      </dl>
      {ticket.priorityReason && (
        <p className="mt-2 text-[12.5px] text-ink-3">{ticket.priorityReason}</p>
      )}
    </div>
  );
}

/** Seletor com os rótulos do domínio: os mesmos textos que o agent e a api usam. */
function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] text-ink-3">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 rounded-md border border-line-strong bg-paper px-2 text-[13.5px] text-ink"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** R16: edição pelo card, sem o modelo; a prioridade é recalculada pela api (RN11). */
function DraftEditForm({
  fields,
  isWorking,
  onSave,
  onCancel,
}: {
  fields: DraftFields;
  isWorking: boolean;
  onSave: (changes: Partial<DraftFields>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(fields);
  const set = (key: keyof DraftFields) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Editar rascunho"
      className="flex flex-col gap-3 border-t border-rule px-[18px] py-4"
    >
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-3">
        Título
        <input
          value={values.title}
          onChange={(event) => set("title")(event.target.value)}
          className="h-9 rounded-md border border-line-strong px-2.5 text-[13.5px] text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-3">
        Descrição
        <textarea
          value={values.description}
          onChange={(event) => set("description")(event.target.value)}
          rows={3}
          className="rounded-md border border-line-strong px-2.5 py-2 text-[13.5px] text-ink"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectField
          label="Tipo"
          value={values.type}
          options={TICKET_TYPES}
          labels={TICKET_TYPE_LABELS}
          onChange={set("type")}
        />
        <SelectField
          label="Categoria"
          value={values.category}
          options={TICKET_CATEGORIES}
          labels={TICKET_CATEGORY_LABELS}
          onChange={set("category")}
        />
        <SelectField
          label="Quem é afetado"
          value={values.affected}
          options={AFFECTED_SCOPES}
          labels={AFFECTED_SCOPE_LABELS}
          onChange={set("affected")}
        />
        <SelectField
          label="Urgência"
          value={values.urgency}
          options={URGENCY_LEVELS}
          labels={URGENCY_LABELS}
          onChange={set("urgency")}
        />
      </div>
      <p className="text-[12.5px] text-ink-3">
        A prioridade é recalculada pelas regras do service desk.
      </p>
      <div className="flex gap-1.5">
        <Button type="submit" disabled={isWorking}>
          Salvar
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isWorking}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
