import { Check, CheckCheck, Search } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../../../ui/Avatar.tsx";
import { avatarToneFor } from "../../../ui/avatar-tones.ts";
import { cx } from "../../../ui/cx.ts";
import { Skeleton } from "../../../ui/Feedback.tsx";
import { TONE_DOT_CLASSES } from "../../../ui/status-styles.ts";
import type { ConsoleFilter, ConsoleList, ConsoleListItem } from "../console-api.ts";
import { CONSOLE_FILTERS } from "../console-api.ts";
import { listTime, stateTag } from "../console-model.ts";

const FILTER_LABELS: Record<ConsoleFilter, string> = {
  all: "Todas",
  for_you: "Para você",
  with_agent: "Com o agent",
  mine: "Minhas",
};

const TAG_TEXT_CLASSES = {
  warning: "text-warning-text",
  danger: "text-danger-text",
  success: "text-ink-3",
  primary: "text-primary-text",
  neutral: "text-ink-3",
} as const;

type ConversationListProps = {
  data: ConsoleList | undefined;
  isLoading: boolean;
  error: string | null;
  filter: ConsoleFilter;
  onFilter: (filter: ConsoleFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: Date;
};

/** RF18, tela 4: a lista de conversas, com busca e filtros com contagem. */
export function ConversationList(props: ConversationListProps) {
  const { data, filter } = props;
  return (
    <section aria-labelledby="console-list-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
        <div className="flex items-center gap-2">
          <h1 id="console-list-title" className="flex-1 text-xl font-bold text-ink">
            Conversas
          </h1>
          <AvailabilityToggle />
        </div>
        <label className="flex h-9 items-center gap-2.5 rounded-full bg-desk px-3">
          <Search aria-hidden size={15} className="text-ink-3" />
          <span className="sr-only">Pesquisar conversa ou chamado</span>
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-hidden placeholder:text-ink-3"
          />
        </label>
        <div role="group" aria-label="Filtro das conversas" className="flex flex-wrap gap-1">
          {CONSOLE_FILTERS.map((option) => {
            const isActive = option === filter;
            const count = data?.counts[option];
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isActive}
                aria-label={
                  option === "all" || count === undefined
                    ? FILTER_LABELS[option]
                    : `${FILTER_LABELS[option]}, ${count} ${count === 1 ? "conversa" : "conversas"}`
                }
                onClick={() => props.onFilter(option)}
                className={cx(
                  "flex items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[12.5px] font-medium",
                  isActive ? "bg-primary-soft text-primary-text" : "bg-desk text-ink-2",
                )}
              >
                {FILTER_LABELS[option]}
                {option !== "all" && count !== undefined && (
                  <span
                    className={cx("font-semibold", isActive ? "text-primary-text" : "text-ink-3")}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {props.isLoading ? (
          <div
            aria-busy="true"
            aria-label="Carregando conversas"
            className="flex flex-col gap-2 p-2"
          >
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : props.error ? (
          <p role="alert" className="p-4 text-[13.5px] text-danger-text">
            {props.error}
          </p>
        ) : data && data.conversations.length === 0 ? (
          <p className="p-4 text-center text-[13.5px] text-ink-3">Nenhuma conversa neste filtro.</p>
        ) : (
          <ul aria-label="Conversas" className="flex flex-col">
            {data?.conversations.map((item) => (
              <li key={item.id}>
                <ConversationItem
                  item={item}
                  isSelected={item.id === props.selectedId}
                  onSelect={() => props.onSelect(item.id)}
                  now={props.now}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ConversationItem({
  item,
  isSelected,
  onSelect,
  now,
}: {
  item: ConsoleListItem;
  isSelected: boolean;
  onSelect: () => void;
  now: Date;
}) {
  const tag = stateTag(item.state, now);
  const last = item.lastMessage;
  const isOutgoing = last !== null && last.author !== "employee";
  const preview = last ? `${last.author === "agent" ? "Nexo: " : ""}${last.text}` : "Sem mensagens";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      data-conversation-id={item.id}
      // 10.7: as etiquetas coloridas ficam sobre paper; o selecionado ganha contorno, não fundo.
      className={cx(
        "flex w-full gap-3 rounded-xl p-2.5 text-left",
        isSelected ? "bg-paper ring-2 ring-primary-soft" : "hover:bg-desk/60",
      )}
    >
      <span className="relative flex h-fit shrink-0">
        <Avatar name={item.employee.name} size="xl" tone={avatarToneFor(item.employee.name)} />
        {item.employee.isOnline && (
          <span
            aria-hidden
            className="absolute right-0 bottom-0 size-[11px] rounded-full border-2 border-paper bg-success"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px] border-b border-rule pb-2.5">
        <span className="flex items-center gap-2">
          <span
            className={cx(
              "min-w-0 flex-1 truncate text-[15.5px] text-ink",
              item.unread > 0 ? "font-semibold" : "font-medium",
            )}
          >
            {item.employee.name}
            {item.employee.isOnline && <span className="sr-only"> (online)</span>}
          </span>
          {last && (
            <span
              className={cx(
                "text-[12.5px]",
                item.unread > 0 ? "font-semibold text-cta" : "text-ink-3",
              )}
            >
              {listTime(last.createdAt, now)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {isOutgoing && last.seenByEmployee !== null && <SeenTicks seen={last.seenByEmployee} />}
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-3">{preview}</span>
          {item.unread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cta px-1.5 text-[11.5px] font-bold text-paper">
              {item.unread}
              <span className="sr-only"> não lidas</span>
            </span>
          )}
        </span>
        <span
          className={cx(
            "flex items-center gap-[5px] text-[11.5px] font-medium",
            TAG_TEXT_CLASSES[tag.tone],
          )}
        >
          <span aria-hidden className={cx("size-1.5 rounded-full", TONE_DOT_CLASSES[tag.tone])} />
          {tag.label}
        </span>
      </span>
    </button>
  );
}

/** A20: ✓ entregue, ✓✓ vista pelo funcionário. */
export function SeenTicks({ seen }: { seen: boolean }) {
  return seen ? (
    <CheckCheck size={15} className="shrink-0 text-primary" aria-label="vista" />
  ) : (
    <Check size={15} className="shrink-0 text-ink-3" aria-label="entregue" />
  );
}

const AVAILABILITY_KEY = "nexo.console.disponivel";

/**
 * A21: "Disponível" é só visual (não muda o roteamento) e fica salvo neste navegador. Guardar no
 * perfil do analista é da tela "Meu perfil" (T25).
 */
function AvailabilityToggle() {
  const [isAvailable, setIsAvailable] = useState(
    () => localStorage.getItem(AVAILABILITY_KEY) !== "false",
  );
  const toggle = () => {
    const next = !isAvailable;
    localStorage.setItem(AVAILABILITY_KEY, String(next));
    setIsAvailable(next);
  };
  return (
    <button
      type="button"
      aria-pressed={isAvailable}
      onClick={toggle}
      className={cx(
        "flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[12.5px] font-semibold",
        isAvailable ? "bg-success-soft text-success-text" : "bg-desk text-ink-3",
      )}
    >
      <span
        aria-hidden
        className={cx("size-[7px] rounded-full", isAvailable ? "bg-success" : "bg-ink-3")}
      />
      {isAvailable ? "Disponível" : "Ausente"}
    </button>
  );
}
