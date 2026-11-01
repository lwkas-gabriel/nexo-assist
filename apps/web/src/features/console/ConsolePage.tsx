import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MessageSquare } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBreakpoint } from "../../lib/use-breakpoint.ts";
import { Avatar } from "../../ui/Avatar.tsx";
import { useQueryView } from "../../lib/use-query-view.ts";
import { ErrorState, LoadingState, Skeleton } from "../../ui/Feedback.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { SidePanel } from "../../ui/SidePanel.tsx";
import { NexoMark } from "../auth/NexoMark.tsx";
import type { CurrentUser } from "../auth/auth-api.ts";
import { DecisionPanel } from "../chat/components/DecisionPanel.tsx";
import { decisionOf } from "../chat/decision-model.ts";
import {
  assumeConversation,
  closeService,
  fetchConsoleConversation,
  fetchConsoleList,
  fetchConsoleTickets,
  releaseConversation,
  replyToConversation,
  type ConsoleFilter,
} from "./console-api.ts";
import type { ServiceActionKind, ServiceActions } from "./components/ServiceBar.tsx";
import { ConsoleConversationView } from "./components/ConsoleConversationView.tsx";
import { ConversationList } from "./components/ConversationList.tsx";
import { TicketHistoryPanel } from "./components/TicketHistoryPanel.tsx";

/** O console é tempo real por polling curto (5: 2 a 3 s), só com ele aberto. */
const POLL_MS = 3000;
/** Os chamados mudam devagar: sem polling curto, só a cada meio minuto. */
const TICKETS_POLL_MS = 30_000;
/** A busca espera a pessoa parar de digitar, em vez de uma consulta por tecla (RT10). */
const SEARCH_DEBOUNCE_MS = 300;
const MINUTE_MS = 60_000;

/** O relógio da tela, a cada minuto: "contato em N min" e as horas da lista (R36). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * O painel da direita: "auto" são os chamados que abrem sozinhos ao escolher uma conversa, só
 * como coluna do desktop; "tickets" foi pedido por quem usa (botão); "decision" é o detalhe de
 * uma resposta (R28).
 */
type Panel = "auto" | "tickets" | "decision" | null;

type ConsolePageProps = { user: CurrentUser; isLoggingOut: boolean; onLogout: () => void };

/**
 * Tela 4 (10.6): trilho + lista de 380 px + conversa + painel de 340 px no desktop. Abaixo de
 * 1280 px o painel vira gaveta; no celular, uma coluna por vez (lista → conversa → chamados).
 */
export function ConsolePage({ user, isLoggingOut, onLogout }: ConsolePageProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";
  const isDesktop = breakpoint === "desktop";
  const now = useNow();
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [query, setQuery] = useState("");
  const searchedQuery = useDebounced(query, SEARCH_DEBOUNCE_MS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const decisionPanelId = useId();
  // Para onde o foco volta depois que o painel ou a coluna mudam (10.7): aplicado num efeito,
  // depois de o React montar o que mudou, para nada o roubar em seguida.
  // Um elemento, ou quem o encontra depois que a tela mudar (o campo de resposta só existe
  // quando a conversa recarregada já diz que o atendimento é meu).
  const pendingFocusRef = useRef<HTMLElement | (() => HTMLElement | null) | null>(null);
  const decisionOpenerRef = useRef<HTMLElement | null>(null);

  const list = useQuery({
    queryKey: ["console", "list", filter, searchedQuery],
    queryFn: () => fetchConsoleList(filter, searchedQuery),
    refetchInterval: POLL_MS,
    placeholderData: (previous) => previous,
  });
  const { view: listView, retry: retryList, isRetrying: isRetryingList } = useQueryView(list);
  const listData = listView.status === "ready" ? listView.data : undefined;
  const conversation = useQuery({
    queryKey: ["console", "conversation", selectedId],
    queryFn: () => fetchConsoleConversation(selectedId ?? ""),
    enabled: selectedId !== null,
    refetchInterval: POLL_MS,
  });
  const {
    view: conversationView,
    retry: retryConversation,
    isRetrying: isRetryingConversation,
  } = useQueryView(conversation);
  const tickets = useQuery({
    queryKey: ["console", "tickets", selectedId],
    queryFn: () => fetchConsoleTickets(selectedId ?? ""),
    enabled: selectedId !== null,
    refetchInterval: TICKETS_POLL_MS,
  });
  const {
    view: ticketsView,
    retry: retryTickets,
    isRetrying: isRetryingTickets,
  } = useQueryView(tickets);

  // Tela 5: cada ação recarrega a conversa, a lista e os chamados (o status do chamado muda ao
  // assumir, R31). O erro fica na barra de baixo da conversa.
  const queryClient = useQueryClient();
  // 10.7: depois da ação, o botão clicado some; o foco vai para onde o trabalho continua.
  // Se a ação falha, nada some: o botão clicado volta a ficar habilitado, mas o navegador já tinha
  // jogado o foco no <body> quando ele foi desabilitado. O foco volta a ele (ou ao campo).
  const actionOpenerRef = useRef<HTMLElement | null>(null);
  const shouldReturnToOpenerRef = useRef(false);
  const service = useMutation({
    mutationFn: ({
      run,
    }: {
      kind: ServiceActionKind;
      run: () => Promise<unknown>;
      focusAfter: string;
    }) => run(),
    onMutate: () => {
      actionOpenerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onError: () => {
      shouldReturnToOpenerRef.current = true;
    },
    onSuccess: (_result, { focusAfter }) => {
      pendingFocusRef.current = () => document.getElementById(focusAfter);
      return queryClient.invalidateQueries({ queryKey: ["console"] });
    },
  });
  const serviceActions: ServiceActions = {
    isWorking: service.isPending,
    pending: service.isPending ? service.variables.kind : null,
    error: service.error ? service.error.message : null,
    assume: () =>
      service.mutate({
        kind: "assume",
        run: () => assumeConversation(selectedId ?? ""),
        focusAfter: "console-reply",
      }),
    release: () =>
      service.mutate({
        kind: "release",
        run: () => releaseConversation(selectedId ?? ""),
        focusAfter: "console-conversation-title",
      }),
    close: () =>
      service.mutate({
        kind: "close",
        run: () => closeService(selectedId ?? ""),
        focusAfter: "console-conversation-title",
      }),
    reply: (text) =>
      service.mutateAsync({
        kind: "reply",
        run: () => replyToConversation(selectedId ?? "", text),
        focusAfter: "console-reply",
      }),
  };

  const conversationData = conversationView.status === "ready" ? conversationView.data : undefined;
  const decisionMessage = conversationData?.messages.find((message) => message.id === decisionId);
  const decision = decisionMessage ? decisionOf(decisionMessage) : undefined;
  // A resposta do detalhe saiu da janela da conversa: o painel volta aos chamados.
  const effectivePanel: Panel = panel === "decision" && !decision ? "auto" : panel;
  const panelOpen =
    effectivePanel === "tickets" ||
    effectivePanel === "decision" ||
    (effectivePanel === "auto" && isDesktop);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null) return;
    const element = typeof target === "function" ? target() : target;
    // Ainda não está na tela (a conversa recarregando): tenta de novo na próxima renderização.
    if (!element) return;
    pendingFocusRef.current = null;
    element.focus();
  });
  // Sem lista de dependências, como o de cima: o botão só volta a ficar habilitado na renderização
  // seguinte à falha.
  useEffect(() => {
    if (!shouldReturnToOpenerRef.current) return;
    const opener = actionOpenerRef.current;
    const isGone = !opener?.isConnected;
    if (!isGone && opener instanceof HTMLButtonElement && opener.disabled) return;
    shouldReturnToOpenerRef.current = false;
    if (isGone) return;
    // Quem já levou o foco para outro lugar o mantém; só o foco perdido (no <body>) é devolvido.
    if (document.activeElement === document.body || document.activeElement === opener) {
      opener.focus();
    }
  });

  const selectConversation = (id: string) => {
    service.reset();
    setSelectedId(id);
    setDecisionId(null);
    setPanel("auto");
  };
  const backToList = () => {
    const fromId = selectedId;
    pendingFocusRef.current = () =>
      document.querySelector<HTMLElement>(`[data-conversation-id="${fromId ?? ""}"]`);
    setSelectedId(null);
  };
  const toggleDecision = (messageId: string, opener: HTMLElement) => {
    if (effectivePanel === "decision" && decisionId === messageId) {
      pendingFocusRef.current = opener;
      setPanel("auto");
      return;
    }
    decisionOpenerRef.current = opener;
    setDecisionId(messageId);
    setPanel("decision");
  };
  const closePanel = () => {
    if (effectivePanel === "decision") {
      pendingFocusRef.current = decisionOpenerRef.current;
      setPanel("auto");
      return;
    }
    setPanel(null);
  };
  const firstName = conversationData?.conversation.employee.name.split(" ")[0] ?? "";
  const showList = !isMobile || selectedId === null;
  const showConversation = !isMobile || selectedId !== null;

  /** A conversa escolhida: carregando, erro com nova tentativa, ou a conversa (que não sai mais). */
  function renderConversation() {
    if (conversationView.status === "loading") {
      return (
        <LoadingState
          label="Carregando a conversa"
          className="flex flex-1 flex-col gap-4 bg-console p-10"
        >
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-16 w-2/3 self-end" />
          <Skeleton className="h-10 w-1/3" />
        </LoadingState>
      );
    }
    if (conversationView.status === "error") {
      return (
        <ErrorState
          message={conversationView.message}
          onRetry={retryConversation}
          isRetrying={isRetryingConversation}
          className="flex-1 justify-center bg-console"
        />
      );
    }
    return (
      <ConsoleConversationView
        key={selectedId}
        data={conversationView.data}
        isOutOfSync={conversationView.isOutOfSync}
        now={now}
        onBack={isMobile ? backToList : undefined}
        onOpenTickets={panelOpen ? undefined : () => setPanel("tickets")}
        onOpenDecision={toggleDecision}
        openDecisionId={effectivePanel === "decision" ? decisionId : null}
        decisionPanelId={decisionPanelId}
        focusTitleOnOpen={isMobile}
        actions={serviceActions}
      />
    );
  }

  return (
    <div className="flex h-dvh bg-paper">
      <nav
        aria-label="Navegação do console"
        className="hidden w-16 shrink-0 flex-col items-center gap-1.5 border-r border-rule bg-desk py-4 md:flex"
      >
        <span className="flex size-10 items-center justify-center pb-2">
          <NexoMark tone="onLight" />
        </span>
        <span
          className="relative flex size-10 items-center justify-center rounded-lg bg-paper text-ink"
          title="Conversas"
        >
          <MessageSquare aria-hidden size={19} />
          <span className="sr-only">Conversas</span>
          {(listData?.counts.for_you ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-desk bg-cta px-[5px] text-[10px] font-bold text-paper">
              {listData?.counts.for_you}
              <span className="sr-only"> aguardando analista</span>
            </span>
          )}
        </span>
        <span className="flex-1" />
        <IconButton
          label="Sair"
          icon={<LogOut size={17} />}
          onClick={onLogout}
          disabled={isLoggingOut}
        />
        <span className="relative" title={`${user.name} · ${user.department}`}>
          <Avatar name={user.name} size="md" />
          <span
            aria-hidden
            className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-desk bg-success"
          />
        </span>
      </nav>

      {showList && (
        // No celular a lista é a tela inteira, então é o landmark principal; do tablet para cima o
        // principal é a conversa, ao lado.
        <ListColumn
          isMain={isMobile}
          className="flex min-h-0 w-full shrink-0 flex-col border-r border-rule md:w-[380px]"
        >
          {isMobile && (
            <div className="flex items-center justify-between border-b border-rule px-4 py-2">
              <NexoMark tone="onLight" />
              <IconButton
                label="Sair"
                icon={<LogOut size={17} />}
                onClick={onLogout}
                disabled={isLoggingOut}
              />
            </div>
          )}
          <ConversationList
            view={listView}
            onRetry={retryList}
            isRetrying={isRetryingList}
            filter={filter}
            onFilter={setFilter}
            query={query}
            isSearchPending={query !== searchedQuery}
            onQuery={setQuery}
            selectedId={selectedId}
            onSelect={selectConversation}
            now={now}
          />
        </ListColumn>
      )}

      {showConversation && (
        <main className="flex min-w-0 flex-1">
          {/* No celular a lista (e o título "Conversas") sai da tela com a conversa aberta. */}
          {isMobile && <h1 className="sr-only">Console</h1>}
          {selectedId === null ? (
            <div className="flex flex-1 items-center justify-center bg-console px-6 text-center text-[14.5px] text-ink-3">
              Escolha uma conversa na lista.
            </div>
          ) : (
            renderConversation()
          )}
          {selectedId !== null && (
            <SidePanel
              // Uma conversa nova (ou outra resposta) é um painel novo: nada sobra da anterior.
              key={
                effectivePanel === "decision"
                  ? `decision-${decisionId ?? ""}`
                  : `tickets-${selectedId}`
              }
              id={decisionPanelId}
              title={
                effectivePanel === "decision" ? "Detalhe da decisão" : `Chamados de ${firstName}`
              }
              open={panelOpen}
              // Os chamados que abrem sozinhos não tiram o foco de quem escolheu a conversa.
              focusOnOpen={effectivePanel !== "auto"}
              onClose={closePanel}
              inlineFrom="desktop"
              mobileMode="fullscreen"
              widthClass="w-[340px]"
            >
              {effectivePanel === "decision" && decision ? (
                <DecisionPanel decision={decision} />
              ) : (
                <TicketHistoryPanel
                  view={ticketsView}
                  onRetry={retryTickets}
                  isRetrying={isRetryingTickets}
                />
              )}
            </SidePanel>
          )}
        </main>
      )}
    </div>
  );
}

/** A coluna da lista: `main` quando ela é a única coisa na tela (celular), `div` ao lado da conversa. */
function ListColumn({
  isMain,
  className,
  children,
}: {
  isMain: boolean;
  className: string;
  children: ReactNode;
}) {
  return isMain ? (
    <main className={className}>{children}</main>
  ) : (
    <div className={className}>{children}</div>
  );
}
