import { CHAT_MESSAGE_MAX_CHARS } from "@nexo/shared/contracts";
import { CircleX, Hand, SendHorizontal, Undo2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../../ui/Button.tsx";
import type { ConsoleConversation } from "../console-api.ts";
import { describeContactDue } from "../console-model.ts";

/** As ações da tela 5 (RF20), feitas pela página; aqui só os botões e o campo. */
export type ServiceActions = {
  isWorking: boolean;
  error: string | null;
  assume: () => void;
  release: () => void;
  close: () => void;
  /** Resolve quando a mensagem foi gravada: o campo só se esvazia aí. */
  reply: (text: string) => Promise<unknown>;
};

/** Cabeçalho da tela 5: com o atendimento assumido por quem está logado, devolver ou encerrar. */
export function ServiceHeaderActions({ actions }: { actions: ServiceActions }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <Button
        variant="secondary"
        onClick={actions.release}
        disabled={actions.isWorking}
        aria-label="Devolver ao agent"
      >
        <Undo2 aria-hidden size={15} />
        {/* Abaixo de 1024 px, só o ícone: o nome vem do aria-label. */}
        <span aria-hidden className="hidden lg:inline">
          Devolver ao agent
        </span>
      </Button>
      <Button
        variant="danger-soft"
        onClick={actions.close}
        disabled={actions.isWorking}
        aria-label="Encerrar atendimento"
      >
        <CircleX aria-hidden size={15} />
        <span aria-hidden className="hidden lg:inline">
          Encerrar atendimento
        </span>
      </Button>
    </div>
  );
}

/**
 * A barra de baixo da conversa (telas 4 e 5): aguardando, assumir ou devolver; assumida por
 * quem está logado, o campo de resposta; com outro analista ou com o agent, o campo trancado.
 */
export function ServiceBar({
  data,
  now,
  actions,
}: {
  data: ConsoleConversation;
  now: Date;
  actions: ServiceActions;
}) {
  const { conversation } = data;
  const { state, handoff, employee } = conversation;
  const firstName = employee.name.split(" ")[0];

  if (state.kind === "analyst" && state.byMe) {
    return (
      <div className="shrink-0 border-t border-rule bg-paper px-5 pt-3 pb-3.5">
        <ReplyForm actions={actions} recipient={firstName ?? employee.name} />
        <ActionError error={actions.error} />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-rule bg-paper px-5 pt-3 pb-3.5">
      {state.kind === "waiting" && (
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
            <Hand aria-hidden size={17} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[14.5px] font-semibold text-ink">{firstName} espera um atendente</p>
            <p className="text-[12.5px] text-ink-3">
              Agent pausado
              {handoff &&
                ` · Suporte ${handoff.supportLevel} · ${describeContactDue(handoff.responseDueAt, now)}`}
            </p>
            {/* R17: o resumo para o analista não precisar reler a conversa. */}
            {handoff && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-ink-3">Motivo</dt>
                <dd className="text-ink">{handoff.reason}</dd>
                <dt className="text-ink-3">Problema</dt>
                <dd className="text-ink">{handoff.problem}</dd>
                <dt className="text-ink-3">Já tentado</dt>
                <dd className="text-ink">{handoff.attempted}</dd>
              </dl>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button variant="secondary" onClick={actions.release} disabled={actions.isWorking}>
              <Undo2 aria-hidden size={15} />
              Devolver ao agent
            </Button>
            <Button onClick={actions.assume} disabled={actions.isWorking}>
              <Hand aria-hidden size={16} />
              Assumir atendimento
            </Button>
          </div>
        </div>
      )}
      <p className="mt-2.5 flex h-11 items-center rounded-lg bg-desk px-3.5 text-[14.5px] text-ink-3">
        {state.kind === "waiting"
          ? "Assuma o atendimento para responder"
          : state.kind === "analyst"
            ? `${state.analyst?.name ?? "Outro analista"} está atendendo`
            : "O assistente está atendendo; a conversa vem para cá quando for transferida"}
      </p>
      <ActionError error={actions.error} />
    </div>
  );
}

function ActionError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-[13px] text-danger-text">
      {error}
    </p>
  ) : null;
}

function ReplyForm({ actions, recipient }: { actions: ServiceActions; recipient: string }) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSend =
    !actions.isWorking && trimmed.length > 0 && trimmed.length <= CHAT_MESSAGE_MAX_CHARS;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    // O campo só se esvazia com a mensagem gravada: numa falha, o texto fica para reenviar.
    void actions.reply(trimmed).then(
      () => setText(""),
      () => undefined,
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-11 items-center gap-2">
      <label htmlFor="console-reply" className="sr-only">
        Resposta para {recipient}
      </label>
      <input
        id="console-reply"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={CHAT_MESSAGE_MAX_CHARS}
        autoComplete="off"
        placeholder={`Responder a ${recipient}…`}
        className="h-full min-w-0 flex-1 rounded-lg bg-desk px-3.5 text-[14.5px] text-ink outline-hidden placeholder:text-ink-3 focus:ring-2 focus:ring-cta"
      />
      <Button type="submit" size="lg" disabled={!canSend}>
        <SendHorizontal aria-hidden size={16} />
        Enviar
      </Button>
    </form>
  );
}
