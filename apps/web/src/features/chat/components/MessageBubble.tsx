import { isToolUIPart, type UIMessage } from "ai";
import { useMemo } from "react";
import type { DraftFields, DraftView } from "../chat-api.ts";
import {
  liveDraft,
  messageAnalyst,
  messageAuthor,
  proposedDraft,
  quickOptionsOf,
  textOf,
} from "../chat-model.ts";
import { decisionOf } from "../decision-model.ts";
import {
  consultedTicketOf,
  isOverdueAndOpen,
  listedTicketsOf,
  type TicketSummaryView,
} from "../ticket-model.ts";
import { SuggestedActions, type SuggestedAction } from "./SuggestedActions.tsx";
import { TicketCard } from "./TicketCard.tsx";
import { TicketPickerList } from "./TicketPickerList.tsx";
import { ActionChips } from "./ActionChips.tsx";
import { DraftCard } from "./DraftCard.tsx";
import { QuickOptions } from "./QuickOptions.tsx";

/** Tela 3: escolher um chamado da lista e responder à oferta de analista (11.5, sem o modelo). */
export type TicketActions = {
  isWorking: boolean;
  /** O erro da última ação, só na resposta em que ela foi feita. */
  errorFor: (messageId: string) => string | null;
  canAddInfo: boolean;
  select: (messageId: string, ticket: TicketSummaryView) => void;
  suggest: (messageId: string, action: SuggestedAction, ticket: TicketSummaryView) => void;
};

export type DraftActions = {
  isWorking: boolean;
  /** O erro da última ação, só no card em que ela falhou. */
  errorFor: (draft: DraftView) => string | null;
  confirm: (draft: DraftView) => void;
  cancel: (draft: DraftView) => void;
  /** Resolve quando a api aceita a edição; o formulário só fecha aí. */
  edit: (draft: DraftView, changes: Partial<DraftFields>) => Promise<unknown>;
};

type MessageBubbleProps = {
  message: UIMessage;
  drafts: readonly DraftView[];
  /** Só a pergunta mais recente aceita resposta rápida. */
  optionsActive: boolean;
  /** O rascunho que aceita ação (o mais recente ainda confirmável); os outros são registro. */
  actionableDraftNumber: number | undefined;
  /** O envio falhou antes de a mensagem chegar ao servidor. */
  isUnsent: boolean;
  /** Abre o detalhe da decisão desta resposta (RF05); `opener` recebe o foco de volta ao fechar. */
  onOpenDecision: (messageId: string, opener: HTMLElement) => void;
  /** A resposta cujo detalhe está aberto, se alguma. */
  openDecisionId: string | null;
  /** Id do painel de detalhe (aria-controls do botão). */
  decisionPanelId: string;
  /**
   * A resposta mais recente, com a conversa com o agent: só ela mostra a oferta de analista e
   * aceita escolher um chamado; as antigas ficam como registro. Enquanto o agent responde, a
   * mais recente passa a ser a nova, e a oferta antiga some de uma vez.
   */
  isLatestAgentTurn: boolean;
  ticketActions: TicketActions;
  onPickOption: (option: string) => void;
  draftActions: DraftActions;
};

/** Uma mensagem da conversa, com a aparência de quem escreveu (tela 2). */
export function MessageBubble(props: MessageBubbleProps) {
  const { message } = props;
  const text = textOf(message);
  const author = messageAuthor(message);
  // Com a conversa com um analista, o agent não responde: não há bolha a mostrar (RN08).
  if (!text && !message.parts.some(isToolUIPart)) return null;

  if (author === "system") {
    return (
      <li className="flex justify-center">
        <p className="max-w-[600px] rounded-full border border-system-line bg-paper px-3 py-1 text-center text-[12.5px] text-ink-3">
          {text}
        </p>
      </li>
    );
  }

  if (author === "employee") {
    return (
      <li className="flex flex-col items-end gap-1">
        <p className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] whitespace-pre-wrap text-paper">
          <span className="sr-only">Você: </span>
          {text}
        </p>
        {props.isUnsent && <span className="text-[12.5px] text-danger-text">Não enviada</span>}
      </li>
    );
  }

  if (author === "analyst") {
    const analyst = messageAnalyst(message);
    return (
      <li className="flex flex-col gap-1.5">
        <span className="text-[12.5px] text-ink-3">
          <span className="font-semibold text-ink">{analyst?.name ?? "Analista de TI"}</span>
          {analyst && ` · ${analyst.department}`}
        </span>
        <p className="max-w-[600px] rounded-[4px_12px_12px_12px] bg-bubble-analyst px-4 py-3 text-[14.5px] leading-normal whitespace-pre-wrap text-ink">
          {text}
        </p>
      </li>
    );
  }

  return <AgentMessage {...props} text={text} />;
}

function AgentMessage({
  message,
  drafts,
  optionsActive,
  actionableDraftNumber,
  onPickOption,
  draftActions,
  onOpenDecision,
  openDecisionId,
  decisionPanelId,
  isLatestAgentTurn,
  ticketActions,
  text,
}: MessageBubbleProps & { text: string }) {
  const options = quickOptionsOf(message);
  // Valida o registro só quando a mensagem muda, não a cada pedaço do streaming de outra.
  const hasDecision = useMemo(() => decisionOf(message) !== undefined, [message]);
  const proposal = proposedDraft(message);
  const draft = proposal ? liveDraft(proposal, drafts) : undefined;
  const consulted = consultedTicketOf(message);
  // Com o chamado já consultado no mesmo turno, a lista vira só o caminho até ele: nada a escolher.
  const listed = consulted ? undefined : listedTicketsOf(message);
  const actionError = ticketActions.errorFor(message.id);
  const offersAnalyst = consulted !== undefined && isOverdueAndOpen(consulted);
  const canAct = isLatestAgentTurn && !ticketActions.isWorking;

  return (
    <li className="flex flex-col gap-1.5">
      <ActionChips
        message={message}
        onOpenDecision={hasDecision ? (opener) => onOpenDecision(message.id, opener) : undefined}
        isDecisionOpen={openDecisionId === message.id}
        decisionPanelId={decisionPanelId}
      />
      {consulted && <TicketCard ticket={consulted} />}
      {(text || options) && (
        <div className="flex max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
          {text && (
            <p className="text-[14.5px] leading-normal whitespace-pre-wrap text-ink">{text}</p>
          )}
          {options && (
            <QuickOptions data={options} isActive={optionsActive} onPick={onPickOption} />
          )}
          {offersAnalyst && isLatestAgentTurn && (
            <SuggestedActions
              isActive={canAct}
              canAddInfo={ticketActions.canAddInfo}
              onAction={(action) => ticketActions.suggest(message.id, action, consulted)}
            />
          )}
        </div>
      )}
      {listed && (
        <TicketPickerList
          tickets={listed}
          isActive={canAct}
          onSelect={(ticket) => ticketActions.select(message.id, ticket)}
        />
      )}
      {actionError && (
        <p role="alert" className="text-[13px] text-danger-text">
          {actionError}
        </p>
      )}
      {draft && (
        <DraftCard
          draft={draft}
          isActionable={draft.number === actionableDraftNumber}
          isWorking={draftActions.isWorking}
          error={draftActions.errorFor(draft)}
          onConfirm={() => draftActions.confirm(draft)}
          onCancel={() => draftActions.cancel(draft)}
          onEdit={(changes) => draftActions.edit(draft, changes)}
        />
      )}
    </li>
  );
}
