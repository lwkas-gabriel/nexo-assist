import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/Button.tsx";
import { Skeleton } from "../../ui/Feedback.tsx";
import type { CurrentUser } from "../auth/auth-api.ts";
import {
  cancelDraft,
  confirmDraft,
  editDraft,
  fetchConversation,
  requestAnalyst,
  startNewSession,
  type ConversationView,
  type DraftFields,
  type DraftView,
} from "./chat-api.ts";
import { describeChatError } from "./chat-error.ts";
import {
  confirmableDraft,
  messageAuthor,
  quickOptionsOf,
  sessionSummaryIndex,
} from "./chat-model.ts";
import { ChatShell } from "./ChatShell.tsx";
import { Composer, SessionLimitNotice } from "./components/Composer.tsx";
import { MessageBubble } from "./components/MessageBubble.tsx";

const CONVERSATION_KEY = ["conversation"] as const;
const DEFAULT_SESSION_LIMIT = 30;

/**
 * O histórico vive no servidor: o navegador manda só o texto da mensagem nova.
 * Assim não há como forjar mensagens anteriores da conversa.
 */
const chatTransport = new DefaultChatTransport({
  api: "/api/chat/messages",
  prepareSendMessagesRequest: ({ messages }) => ({ body: { text: lastText(messages) } }),
});

function lastText(messages: UIMessage[]): string {
  const last = messages.at(-1);
  return (last?.parts ?? [])
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

type ChatPageProps = { user: CurrentUser; isLoggingOut: boolean; onLogout: () => void };

/** Tela 2: carrega a conversa salva (voltar outro dia e continuar, RF11) e mostra o chat. */
export function ChatPage({ user, isLoggingOut, onLogout }: ChatPageProps) {
  const conversation = useQuery({ queryKey: CONVERSATION_KEY, queryFn: fetchConversation });
  const mode = conversation.data?.conversation?.mode ?? "agent";

  return (
    <ChatShell user={user} mode={mode} isLoggingOut={isLoggingOut} onLogout={onLogout}>
      {conversation.isPending ? (
        <div
          aria-busy="true"
          aria-label="Carregando sua conversa"
          className="flex flex-1 flex-col gap-4 px-4 py-7 md:px-12 xl:px-[200px]"
        >
          <Skeleton className="h-10 w-2/3 self-end" />
          <Skeleton className="h-24 w-3/4" />
          <Skeleton className="h-10 w-1/2 self-end" />
        </div>
      ) : conversation.error ? (
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <p className="text-[14.5px] text-ink-2">{conversation.error.message}</p>
          <Button variant="secondary" onClick={() => void conversation.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <ChatConversation user={user} view={conversation.data} />
      )}
    </ChatShell>
  );
}

function ChatConversation({ user, view }: { user: CurrentUser; view: ConversationView }) {
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);

  /** Recarrega do servidor: contador, rascunhos e registros de decisão ficam em dia. */
  async function refresh() {
    const fresh = await queryClient.fetchQuery({
      queryKey: CONVERSATION_KEY,
      queryFn: fetchConversation,
      staleTime: 0,
    });
    setMessages(fresh.messages);
  }

  const { messages, sendMessage, status, error, regenerate, setMessages } = useChat({
    transport: chatTransport,
    messages: view.messages,
    onFinish: () => void refresh(),
  });
  const isBusy = status === "submitted" || status === "streaming";

  // Botões do card e da sessão: ações determinísticas, sem o modelo (11.5).
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => void refresh(),
  });
  const draftActions = {
    isWorking: action.isPending,
    error: action.error ? action.error.message : null,
    confirm: (draft: DraftView) => action.mutate(() => confirmDraft(draft.number)),
    cancel: (draft: DraftView) => action.mutate(() => cancelDraft(draft.number)),
    edit: (draft: DraftView, changes: Partial<DraftFields>) =>
      action.mutate(() => editDraft(draft.number, changes)),
  };

  const lastMessage = messages.at(-1);
  const activeOptions =
    lastMessage && messageAuthor(lastMessage) === "agent" && !isBusy
      ? quickOptionsOf(lastMessage)
      : undefined;
  const pendingDraft = confirmableDraft(messages, view.drafts);
  const summaryIndex = sessionSummaryIndex(messages, view.session);
  const send = (text: string) => void sendMessage({ text });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-end gap-5 px-4 pt-7 pb-1 md:px-12 xl:px-[200px]">
          {messages.length === 0 && (
            <p className="text-center text-[14.5px] text-ink-3">
              Olá, {user.name.split(" ")[0]}. Conte o que está acontecendo, ou pergunte pelos seus
              chamados.
            </p>
          )}
          <ol role="log" aria-label="Conversa com o Nexo Assist" className="flex flex-col gap-5">
            {messages.map((message, index) => (
              <MessageWithSummary
                key={message.id}
                showSummaryBefore={summaryIndex === index}
                summary={view.session?.previousSummary ?? null}
              >
                <MessageBubble
                  message={message}
                  drafts={view.drafts}
                  optionsActive={message === lastMessage && activeOptions !== undefined}
                  actionableDraftNumber={pendingDraft?.number}
                  onPickOption={send}
                  draftActions={draftActions}
                />
              </MessageWithSummary>
            ))}
            {summaryIndex === messages.length && view.session?.previousSummary && (
              <SessionSummaryCard summary={view.session.previousSummary} />
            )}
          </ol>
          {status === "submitted" && (
            <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <LoaderCircle size={12} aria-hidden className="animate-spin" />
              Nexo Assist está pensando…
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3"
            >
              <p className="flex-1 text-[13.5px] text-danger-text">{describeChatError(error)}</p>
              <Button variant="secondary" onClick={() => void regenerate()}>
                Tentar novamente
              </Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pt-2.5 pb-[18px] md:px-12 xl:px-[200px]">
        {view.session?.isAtLimit ? (
          <SessionLimitNotice
            isWorking={action.isPending}
            onNewSession={() => action.mutate(startNewSession)}
            onTalkToAnalyst={() => action.mutate(requestAnalyst)}
          />
        ) : (
          <Composer
            isBusy={isBusy}
            onSend={send}
            counter={{
              used: view.session?.agentMessages ?? 0,
              limit: view.session?.limit ?? DEFAULT_SESSION_LIMIT,
            }}
            quickOptions={activeOptions?.options ?? []}
            onConfirmDraft={pendingDraft ? () => draftActions.confirm(pendingDraft) : undefined}
          />
        )}
      </div>
    </>
  );
}

function MessageWithSummary({
  showSummaryBefore,
  summary,
  children,
}: {
  showSummaryBefore: boolean;
  summary: string | null;
  children: React.ReactNode;
}) {
  return (
    <>
      {showSummaryBefore && summary && <SessionSummaryCard summary={summary} />}
      {children}
    </>
  );
}

/** R03: a sessão nova abre com o resumo da anterior; o histórico continua acima. */
function SessionSummaryCard({ summary }: { summary: string }) {
  return (
    <li className="rounded-lg border border-rule bg-desk px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink-2">Resumo da sessão anterior</p>
      <p className="mt-1 text-[13.5px] text-ink-2">{summary}</p>
    </li>
  );
}
