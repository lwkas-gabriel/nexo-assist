import { useQuery } from "@tanstack/react-query";
import { LogOut, MessageSquare } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useBreakpoint } from "../../lib/use-breakpoint.ts";
import { Avatar } from "../../ui/Avatar.tsx";
import { Button } from "../../ui/Button.tsx";
import { Skeleton } from "../../ui/Feedback.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { SidePanel } from "../../ui/SidePanel.tsx";
import { NexoMark } from "../auth/NexoMark.tsx";
import type { CurrentUser } from "../auth/auth-api.ts";
import { DecisionPanel } from "../chat/components/DecisionPanel.tsx";
import { decisionOf } from "../chat/decision-model.ts";
import {
  fetchConsoleConversation,
  fetchConsoleList,
  fetchConsoleTickets,
  type ConsoleFilter,
} from "./console-api.ts";
import { ConsoleConversationView } from "./components/ConsoleConversationView.tsx";
import { ConversationList } from "./components/ConversationList.tsx";
import { TicketHistoryPanel } from "./components/TicketHistoryPanel.tsx";

/** O console é tempo real por polling curto (5: 2 a 3 s), só com ele aberto. */
const POLL_MS = 3000;
/** Os chamados mudam devagar: sem polling curto, só a cada meio minuto. */
const TICKETS_POLL_MS = 30_000;
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

type ConsolePageProps = { user: CurrentUser; isLoggingOut: boolean; onLogout: () => void };

/**
 * Tela 4 (10.6): trilho + lista de 380 px + conversa + painel de 340 px no desktop. Abaixo de
 * 1280 px o painel vira gaveta; no celular, uma coluna por vez (lista → conversa → chamados).
 */
export function ConsolePage({ user, isLoggingOut, onLogout }: ConsolePageProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";
  const now = useNow();
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // O painel da direita mostra os chamados ou o detalhe da decisão. "auto": os chamados abertos
  // por padrão, que só valem como coluna do desktop; abaixo disso, a gaveta só abre a pedido.
  const [panel, setPanel] = useState<"auto" | "tickets" | "decision" | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const decisionOpenerRef = useRef<HTMLElement | null>(null);
  const decisionPanelId = useId();

  const list = useQuery({
    queryKey: ["console", "list", filter, query],
    queryFn: () => fetchConsoleList(filter, query),
    refetchInterval: POLL_MS,
    placeholderData: (previous) => previous,
  });
  const conversation = useQuery({
    queryKey: ["console", "conversation", selectedId],
    queryFn: () => fetchConsoleConversation(selectedId ?? ""),
    enabled: selectedId !== null,
    refetchInterval: POLL_MS,
  });
  const tickets = useQuery({
    queryKey: ["console", "tickets", selectedId],
    queryFn: () => fetchConsoleTickets(selectedId ?? ""),
    enabled: selectedId !== null,
    refetchInterval: TICKETS_POLL_MS,
  });

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setDecisionId(null);
    setPanel("auto");
  };
  const decisionMessage = conversation.data?.messages.find((message) => message.id === decisionId);
  const decision = decisionMessage ? decisionOf(decisionMessage) : undefined;
  const toggleDecision = (messageId: string, opener: HTMLElement) => {
    if (panel === "decision" && decisionId === messageId) {
      setPanel("auto");
      return;
    }
    decisionOpenerRef.current = opener;
    setDecisionId(messageId);
    setPanel("decision");
  };
  const closePanel = () => {
    const wasDecision = panel === "decision";
    setPanel(wasDecision ? "auto" : null);
    if (wasDecision) decisionOpenerRef.current?.focus();
  };
  const firstName = conversation.data?.conversation.employee.name.split(" ")[0] ?? "";
  const showList = !isMobile || selectedId === null;
  const showConversation = !isMobile || selectedId !== null;

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
          {(list.data?.counts.for_you ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-desk bg-cta px-[5px] text-[10px] font-bold text-paper">
              {list.data?.counts.for_you}
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
        <div className="flex min-h-0 w-full shrink-0 flex-col border-r border-rule md:w-[380px]">
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
            data={list.data}
            isLoading={list.isPending}
            error={list.data ? null : (list.error?.message ?? null)}
            filter={filter}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
            selectedId={selectedId}
            onSelect={selectConversation}
            now={now}
          />
        </div>
      )}

      {showConversation && (
        <main className="flex min-w-0 flex-1">
          {selectedId === null ? (
            <div className="flex flex-1 items-center justify-center bg-console px-6 text-center text-[14.5px] text-ink-3">
              Escolha uma conversa na lista.
            </div>
          ) : conversation.data ? (
            <ConsoleConversationView
              data={conversation.data}
              now={now}
              onBack={isMobile ? () => setSelectedId(null) : undefined}
              onOpenTickets={breakpoint === "desktop" ? undefined : () => setPanel("tickets")}
              onOpenDecision={toggleDecision}
              openDecisionId={panel === "decision" ? decisionId : null}
              decisionPanelId={decisionPanelId}
            />
          ) : conversation.isError ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-3 bg-console px-6 text-center"
            >
              <p className="text-[14.5px] text-ink-2">{conversation.error.message}</p>
              <Button variant="secondary" onClick={() => void conversation.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div
              aria-busy="true"
              aria-label="Carregando a conversa"
              className="flex flex-1 flex-col gap-4 bg-console p-10"
            >
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-16 w-2/3 self-end" />
              <Skeleton className="h-10 w-1/3" />
            </div>
          )}
          {selectedId !== null && (
            <SidePanel
              key={panel === "decision" ? `decision-${decisionId ?? ""}` : "tickets"}
              id={decisionPanelId}
              title={panel === "decision" ? "Detalhe da decisão" : `Chamados de ${firstName}`}
              open={
                panel === "tickets" ||
                (panel === "auto" && breakpoint === "desktop") ||
                (panel === "decision" && decision !== undefined)
              }
              onClose={closePanel}
              inlineFrom="desktop"
              mobileMode="fullscreen"
              widthClass="w-[340px]"
            >
              {panel === "decision" && decision ? (
                <DecisionPanel decision={decision} />
              ) : (
                <TicketHistoryPanel
                  data={tickets.data}
                  isLoading={tickets.isPending}
                  error={tickets.data ? null : (tickets.error?.message ?? null)}
                />
              )}
            </SidePanel>
          )}
        </main>
      )}
    </div>
  );
}
