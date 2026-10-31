import { isToolUIPart, type UIMessage } from "ai";
import type { DraftFields, DraftView } from "../chat-api.ts";
import { liveDraft, messageAuthor, proposedDraft, quickOptionsOf, textOf } from "../chat-model.ts";
import { ActionChips } from "./ActionChips.tsx";
import { DraftCard } from "./DraftCard.tsx";
import { QuickOptions } from "./QuickOptions.tsx";

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
    return (
      <li className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-ink">Analista de TI</span>
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
  text,
}: MessageBubbleProps & { text: string }) {
  const options = quickOptionsOf(message);
  const proposal = proposedDraft(message);
  const draft = proposal ? liveDraft(proposal, drafts) : undefined;

  return (
    <li className="flex flex-col gap-1.5">
      <ActionChips message={message} />
      {(text || options) && (
        <div className="flex max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
          {text && (
            <p className="text-[14.5px] leading-normal whitespace-pre-wrap text-ink">{text}</p>
          )}
          {options && (
            <QuickOptions data={options} isActive={optionsActive} onPick={onPickOption} />
          )}
        </div>
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
