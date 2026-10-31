import { useChat } from "@ai-sdk/react";
import { SESSION_MESSAGE_LIMIT } from "@nexo/shared/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../ui/Button.tsx";
import { Skeleton } from "../../ui/Feedback.tsx";
import { cx } from "../../ui/cx.ts";
import { SidePanel } from "../../ui/SidePanel.tsx";
import type { CurrentUser } from "../auth/auth-api.ts";
import {
  cancelDraft,
  confirmDraft,
  declineOffer,
  editDraft,
  fetchConversation,
  requestAnalyst,
  selectTicket,
  startNewSession,
  type ConversationView,
  type DraftFields,
  type DraftView,
} from "./chat-api.ts";
import { describeChatError } from "./chat-error.ts";
import {
  confirmableDraft,
  lastEmployeeMessage,
  messageAuthor,
  quickOptionsOf,
  sessionSummaryIndex,
  textOf,
} from "./chat-model.ts";
import { ChatShell } from "./ChatShell.tsx";
import { DecisionPanel } from "./components/DecisionPanel.tsx";
import { decisionOf } from "./decision-model.ts";
import { Composer, SessionLimitNotice } from "./components/Composer.tsx";
import {
  MessageBubble,
  type DraftActions,
  type TicketActions,
} from "./components/MessageBubble.tsx";
import type { SuggestedAction } from "./components/SuggestedActions.tsx";
import type { TicketSummaryView } from "./ticket-model.ts";

const CONVERSATION_KEY = ["conversation"] as const;

/**
 * O histórico vive no servidor: o navegador manda só o texto da mensagem nova, com o id da bolha
 * (a conversa recarregada mantém os mesmos ids, e o reenvio depois de uma falha não duplica).
 * Assim não há como forjar mensagens anteriores da conversa.
 */
const chatTransport = new DefaultChatTransport({
  api: "/api/chat/messages",
  // `body` traz o que o envio acrescenta, como a marca de resposta rápida (R38).
  prepareSendMessagesRequest: ({ messages, body }) => {
    const last = messages.at(-1);
    return {
      body: { ...body, text: last ? textOf(last) : "", ...(last ? { id: last.id } : {}) },
    };
  },
});

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

type DraftAction = { draft: DraftView; run: () => Promise<unknown> };

function ChatConversation({ user, view }: { user: CurrentUser; view: ConversationView }) {
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const mode = view.conversation?.mode ?? "agent";
  // Detalhe da decisão (RF05): qual resposta, e quem abriu, para o foco voltar ao fechar.
  const [openDecisionId, setOpenDecisionId] = useState<string | null>(null);
  const decisionOpenerRef = useRef<HTMLElement | null>(null);
  const decisionPanelId = useId();

  /** Recarrega do servidor: contador, rascunhos, modo e registros de decisão ficam em dia. */
  function reloadView() {
    return queryClient.fetchQuery({
      queryKey: CONVERSATION_KEY,
      queryFn: fetchConversation,
      staleTime: 0,
    });
  }

  /** Recarrega também as mensagens; os ids são os mesmos, então as bolhas não são remontadas. */
  async function refresh() {
    setMessages((await reloadView()).messages);
  }

  const { messages, sendMessage, status, error, setMessages, clearError } = useChat({
    transport: chatTransport,
    messages: view.messages,
    // Depois de uma falha, a bolha que não teve resposta fica na tela para o "Tentar novamente".
    onFinish: ({ isError }) => void (isError ? reloadView() : refresh()),
  });
  const isBusy = status === "submitted" || status === "streaming";

  // Botões do card: ações determinísticas, sem o modelo (11.5). O erro fica no card que falhou.
  const draftAction = useMutation({
    mutationFn: ({ run }: DraftAction) => run(),
    onSuccess: async () => {
      await refresh();
      composerRef.current?.focus();
    },
  });
  // Nova sessão e "Falar com um analista": separadas do card, com o erro no próprio aviso.
  const sessionAction = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      clearError();
      await refresh();
    },
  });

  // Tela 3: escolher um chamado e responder à oferta de analista, sem o modelo (11.5).
  const ticketAction = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      await refresh();
      composerRef.current?.focus();
    },
  });
  // "Adicionar informação": o campo de mensagem recomeça com o começo da frase (nova key).
  const [composerSeed, setComposerSeed] = useState({ key: 0, text: "" });
  useEffect(() => {
    const input = composerRef.current;
    if (composerSeed.key === 0 || !input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [composerSeed]);
  const suggest = (action: SuggestedAction, ticket: TicketSummaryView) => {
    if (action === "add_info") {
      setComposerSeed((seed) => ({
        key: seed.key + 1,
        text: `Quero adicionar uma informação ao ${ticket.number}: `,
      }));
      return;
    }
    ticketAction.mutate(() =>
      action === "analyst" ? requestAnalyst(ticket.number) : declineOffer(ticket.number),
    );
  };
  const ticketActions: TicketActions = {
    isWorking: ticketAction.isPending || isBusy,
    error: ticketAction.error ? ticketAction.error.message : null,
    select: (ticket) => ticketAction.mutate(() => selectTicket(ticket.number)),
    suggest,
  };

  const pendingDraft = confirmableDraft(messages, view.drafts);
  const draftActions: DraftActions = {
    // Enquanto o agent responde, o card pode estar mudando: os botões esperam o fim do turno.
    isWorking: draftAction.isPending || isBusy,
    errorFor: (draft) =>
      draftAction.error && draftAction.variables?.draft.number === draft.number
        ? draftAction.error.message
        : null,
    confirm: (draft) => draftAction.mutate({ draft, run: () => confirmDraft(draft.number) }),
    cancel: (draft) => draftAction.mutate({ draft, run: () => cancelDraft(draft.number) }),
    edit: (draft, changes: Partial<DraftFields>) =>
      draftAction.mutateAsync({ draft, run: () => editDraft(draft.number, changes) }),
  };

  const lastMessage = messages.at(-1);
  const activeOptions =
    lastMessage && messageAuthor(lastMessage) === "agent" && !isBusy
      ? quickOptionsOf(lastMessage)
      : undefined;
  const summaryIndex = sessionSummaryIndex(messages, view.session);
  // A mensagem que ficou sem resposta; "não enviada" se nem chegou a ser gravada no servidor.
  const failedMessage = error ? lastEmployeeMessage(messages) : undefined;
  const unsentMessageId =
    failedMessage && !view.messages.some((message) => message.id === failedMessage.id)
      ? failedMessage.id
      : undefined;
  // RN14: o limite vale para o agent; com um analista, o funcionário continua escrevendo.
  const isAtLimit = mode === "agent" && view.session?.isAtLimit === true;

  const send = (text: string) => void sendMessage({ text });
  // R38: a api confere a opção e dispensa o classificador; o foco volta ao campo de mensagem.
  const pickOption = (option: string) => {
    void sendMessage({ text: option }, { body: { quickOption: true } });
    composerRef.current?.focus();
  };
  const retry = (message: UIMessage) =>
    void sendMessage({ text: textOf(message), messageId: message.id });
  const talkToAnalyst = () => sessionAction.mutate(requestAnalyst);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const openDecisionMessage = messages.find((message) => message.id === openDecisionId);
  const openDecision = openDecisionMessage ? decisionOf(openDecisionMessage) : undefined;
  // A resposta aberta saiu da conversa (janela de 200 mensagens): o painel conta como fechado,
  // e o foco, que estava no botão dela, vai para o campo de mensagem.
  const shownDecisionId = openDecision ? openDecisionId : null;
  const lostOpenDecision = openDecisionId !== null && openDecision === undefined;
  useEffect(() => {
    if (lostOpenDecision) composerRef.current?.focus();
  }, [lostOpenDecision]);
  // O botão alterna: clicar de novo na mesma resposta fecha o detalhe.
  const toggleDecision = (messageId: string, opener: HTMLElement) => {
    if (shownDecisionId === messageId) {
      setOpenDecisionId(null);
      return;
    }
    decisionOpenerRef.current = opener;
    setOpenDecisionId(messageId);
  };
  // Com o detalhe aberto, ele vira uma coluna no desktop: a conversa abre mão do recuo largo
  // do protótipo para o card do rascunho não ficar espremido.
  const sidePadding = openDecision ? "px-4 md:px-12" : "px-4 md:px-12 xl:px-[200px]";
  const closeDecision = () => {
    setOpenDecisionId(null);
    decisionOpenerRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className={cx("flex min-h-full flex-col justify-end gap-5 pt-7 pb-1", sidePadding)}>
            {messages.length === 0 && (
              <p className="text-center text-[14.5px] text-ink-3">
                Olá, {user.name.split(" ")[0]}. Conte o que está acontecendo, ou pergunte pelos seus
                chamados.
              </p>
            )}
            <div role="log" aria-label="Conversa com o Nexo Assist" className="flex flex-col gap-5">
              <ol className="flex flex-col gap-5">
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
                      isUnsent={message.id === unsentMessageId}
                      onOpenDecision={toggleDecision}
                      openDecisionId={shownDecisionId}
                      decisionPanelId={decisionPanelId}
                      onPickOption={pickOption}
                      draftActions={draftActions}
                      isLatestAgentTurn={message === lastMessage && !isBusy && mode === "agent"}
                      ticketActions={ticketActions}
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
            </div>
            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3"
              >
                <p className="flex-1 text-[13.5px] text-danger-text">
                  {describeChatError(error)}
                  {sessionAction.error && ` ${sessionAction.error.message}`}
                </p>
                <div className="flex gap-1.5">
                  {mode === "agent" && (
                    <Button
                      variant="secondary"
                      onClick={talkToAnalyst}
                      disabled={sessionAction.isPending}
                    >
                      Falar com um analista
                    </Button>
                  )}
                  {failedMessage && !isAtLimit && (
                    <Button variant="secondary" onClick={() => retry(failedMessage)}>
                      Tentar novamente
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className={cx("shrink-0 pt-2.5 pb-[18px]", sidePadding)}>
          {isAtLimit ? (
            <SessionLimitNotice
              isWorking={sessionAction.isPending}
              error={sessionAction.error ? sessionAction.error.message : null}
              onNewSession={() => sessionAction.mutate(startNewSession)}
              onTalkToAnalyst={talkToAnalyst}
            />
          ) : (
            <Composer
              key={composerSeed.key}
              initialText={composerSeed.text}
              ref={composerRef}
              isBusy={isBusy}
              onSend={send}
              onPickOption={pickOption}
              counter={{
                used: view.session?.agentMessages ?? 0,
                limit: view.session?.limit ?? SESSION_MESSAGE_LIMIT,
              }}
              quickOptions={activeOptions?.options ?? []}
              onConfirmDraft={
                pendingDraft
                  ? () => {
                      // Ctrl/⌘+Enter repetido durante a confirmação, ou com o agent respondendo,
                      // não manda outra (RN04).
                      if (!draftActions.isWorking) draftActions.confirm(pendingDraft);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
      {/* Coluna à direita no desktop, gaveta no tablet e folha que sobe no celular (10.6). */}
      <SidePanel
        // Outra resposta, painel novo: o foco vai de novo para ele (coluna do desktop).
        key={shownDecisionId ?? "fechado"}
        id={decisionPanelId}
        title="Detalhe da decisão"
        open={openDecision !== undefined}
        onClose={closeDecision}
        inlineFrom="desktop"
        mobileMode="sheet"
        widthClass="w-[360px]"
      >
        {openDecision && <DecisionPanel decision={openDecision} />}
      </SidePanel>
    </div>
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
