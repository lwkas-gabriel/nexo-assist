import type { UIMessage } from "ai";
import { ArrowLeft, Ticket } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { Avatar } from "../../../ui/Avatar.tsx";
import { avatarToneFor } from "../../../ui/avatar-tones.ts";
import { cx } from "../../../ui/cx.ts";
import { IconButton } from "../../../ui/IconButton.tsx";
import { Pill } from "../../../ui/Pill.tsx";
import type { DraftView } from "../../chat/chat-api.ts";
import {
  liveDraft,
  messageAnalyst,
  messageAuthor,
  messageCreatedAt,
  proposedDraft,
  quickOptionsOf,
  textOf,
} from "../../chat/chat-model.ts";
import { ActionChips } from "../../chat/components/ActionChips.tsx";
import { DraftCard } from "../../chat/components/DraftCard.tsx";
import { QuickOptions } from "../../chat/components/QuickOptions.tsx";
import { TicketCard } from "../../chat/components/TicketCard.tsx";
import { TicketPickerList } from "../../chat/components/TicketPickerList.tsx";
import { decisionOf } from "../../chat/decision-model.ts";
import { consultedTicketOf, listedTicketsOf } from "../../chat/ticket-model.ts";
import type { ConsoleConversation } from "../console-api.ts";
import { dayLabel, headerTag, messageTime } from "../console-model.ts";
import { SeenTicks } from "./ConversationList.tsx";
import { ServiceBar, ServiceHeaderActions, type ServiceActions } from "./ServiceBar.tsx";

type ConsoleConversationViewProps = {
  data: ConsoleConversation;
  now: Date;
  /** Celular: volta para a lista (uma coluna por vez, 10.6). */
  onBack: (() => void) | undefined;
  /** Abre os chamados, quando o painel não está aberto (gaveta, ou coluna fechada no desktop). */
  onOpenTickets: (() => void) | undefined;
  onOpenDecision: (messageId: string, opener: HTMLElement) => void;
  openDecisionId: string | null;
  decisionPanelId: string;
  /** Ao abrir a conversa no celular, o foco vai para o título dela (a lista some da tela). */
  focusTitleOnOpen: boolean;
  /** Tela 5: assumir, responder, devolver e encerrar. */
  actions: ServiceActions;
};

const noop = () => undefined;

function seenOf(message: UIMessage): boolean | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("seenByEmployee" in metadata)) {
    return undefined;
  }
  return metadata.seenByEmployee === true;
}

/** RF19, tela 4: a conversa transferida como o analista a lê, com o porquê de cada resposta (R28). */
export function ConsoleConversationView(props: ConsoleConversationViewProps) {
  const { conversation, messages } = props.data;
  const { employee, state, handoff } = conversation;
  const tag = headerTag(state, props.now);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const meta = [employee.isOnline ? "online" : null, employee.department, handoff?.ticketNumber]
    .filter(Boolean)
    .join(" · ");

  // Só quando a conversa é aberta: o polling não mexe no foco de quem está lendo.
  useEffect(() => {
    if (props.focusTitleOnOpen) titleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      aria-labelledby="console-conversation-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-console"
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper pr-4 pl-3 md:pl-5">
        {props.onBack && (
          <IconButton
            label="Voltar para as conversas"
            icon={<ArrowLeft size={18} />}
            onClick={props.onBack}
          />
        )}
        <Avatar name={employee.name} size="lg" tone={avatarToneFor(employee.name)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2
            id="console-conversation-title"
            ref={titleRef}
            tabIndex={-1}
            className="truncate text-[15.5px] font-semibold text-ink"
          >
            {employee.name}
          </h2>
          <p className="truncate text-[12.5px] text-ink-3">{meta}</p>
        </div>
        {/* Atendimento assumido por quem está logado: no lugar da pílula, as ações (tela 5). */}
        {state.kind === "analyst" && state.byMe ? (
          <ServiceHeaderActions actions={props.actions} />
        ) : (
          <span role="status" className="shrink-0">
            <Pill tone={tag.tone} withDot>
              {tag.label}
            </Pill>
          </span>
        )}
        {props.onOpenTickets && (
          <IconButton
            label={`Chamados de ${employee.name}`}
            icon={<Ticket size={18} />}
            onClick={props.onOpenTickets}
          />
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-4 md:px-10">
        <div role="log" aria-label={`Conversa com ${employee.name}`}>
          <ol className="flex flex-col gap-4">
            {messages.map((message, index) => {
              const createdAt = messageCreatedAt(message);
              const before = messages[index - 1];
              const previous = before ? messageCreatedAt(before) : undefined;
              const day = createdAt ? dayLabel(createdAt, props.now) : undefined;
              const showDay =
                day !== undefined && (!previous || dayLabel(previous, props.now) !== day);
              return (
                <Fragment key={message.id}>
                  {showDay && <DayDivider label={day} />}
                  <ConsoleMessage message={message} {...props} />
                </Fragment>
              );
            })}
          </ol>
        </div>
      </div>

      <ServiceBar data={props.data} now={props.now} actions={props.actions} />
    </section>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <li className="flex justify-center">
      <span className="rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-3">
        {label}
      </span>
    </li>
  );
}

/** O que o funcionário viu junto com a resposta (cards e opções), só como registro (RF19). */
function SeenArtifacts({ message, drafts }: { message: UIMessage; drafts: readonly DraftView[] }) {
  const consulted = consultedTicketOf(message);
  const listed = consulted ? undefined : listedTicketsOf(message);
  const options = quickOptionsOf(message);
  const proposal = proposedDraft(message);
  const draft = proposal ? liveDraft(proposal, drafts) : undefined;
  if (!consulted && !listed && !options && !draft) return null;
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-2">
      {consulted && <TicketCard ticket={consulted} />}
      {listed && <TicketPickerList tickets={listed} isActive={false} onSelect={noop} />}
      {options && (
        <div className="rounded-xl bg-paper px-4 py-3">
          <QuickOptions data={options} isActive={false} onPick={noop} />
        </div>
      )}
      {draft && (
        <DraftCard
          draft={draft}
          isActionable={false}
          isWorking={false}
          error={null}
          onConfirm={noop}
          onCancel={noop}
          onEdit={() => Promise.resolve()}
        />
      )}
    </div>
  );
}

function ConsoleMessage({
  message,
  data,
  onOpenDecision,
  openDecisionId,
  decisionPanelId,
}: ConsoleConversationViewProps & { message: UIMessage }) {
  const author = messageAuthor(message);
  const text = textOf(message);
  const createdAt = messageCreatedAt(message);
  const time = createdAt ? messageTime(createdAt) : null;
  const seen = seenOf(message);

  if (author === "system") {
    return (
      <li className="flex items-center gap-3 pt-2">
        <span aria-hidden className="h-px flex-1 bg-system-line" />
        <span className="max-w-[70%] text-center text-[12px] font-medium text-ink-3">
          {text}
          {time && ` · ${time}`}
        </span>
        <span aria-hidden className="h-px flex-1 bg-system-line" />
      </li>
    );
  }

  if (author === "employee") {
    return (
      <li className="flex flex-col items-start">
        <div className="flex max-w-[78%] items-end gap-2.5 rounded-[4px_12px_12px_12px] bg-paper px-3 pt-2 pb-1.5 shadow-bubble">
          <p className="text-[14.5px] whitespace-pre-wrap text-ink">{text}</p>
          {time && <span className="shrink-0 text-[11px] text-ink-3">{time}</span>}
        </div>
      </li>
    );
  }

  const analyst = author === "analyst" ? messageAnalyst(message) : undefined;
  const hasDecision = author === "agent" && decisionOf(message) !== undefined;
  return (
    <li className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-ink-2">
        {author === "agent" ? "Nexo Assist" : (analyst?.name ?? "Analista")}
        {author === "agent" && (
          // 10.7: etiqueta de texto pequeno sobre fundo paper próprio, não sobre o fundo do console.
          <span className="rounded-sm bg-paper px-1.5 py-px text-[11px] text-primary-text">IA</span>
        )}
        {analyst && (
          <span className="rounded-sm bg-paper px-1.5 py-px text-[11px] text-success-text">
            {analyst.department}
          </span>
        )}
      </span>
      {author === "agent" && (
        <ActionChips
          message={message}
          onOpenDecision={hasDecision ? (opener) => onOpenDecision(message.id, opener) : undefined}
          isDecisionOpen={openDecisionId === message.id}
          decisionPanelId={decisionPanelId}
          showAuthor={false}
        />
      )}
      {author === "agent" && <SeenArtifacts message={message} drafts={data.drafts} />}
      {text && (
        <div
          className={cx(
            "flex max-w-[78%] flex-col gap-0.5 rounded-[12px_4px_12px_12px] px-3 pt-2 pb-1.5 shadow-bubble",
            author === "agent" ? "bg-bubble-agent" : "bg-bubble-analyst",
          )}
        >
          <p className="text-[14.5px] whitespace-pre-wrap text-ink">{text}</p>
          <span className="flex items-center justify-end gap-1 text-[11px] text-ink-3">
            {time}
            {seen !== undefined && <SeenTicks seen={seen} />}
          </span>
        </div>
      )}
    </li>
  );
}
