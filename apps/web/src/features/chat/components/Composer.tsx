import { CHAT_MESSAGE_MAX_CHARS } from "@nexo/shared/contracts";
import { ArrowUp } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { Button } from "../../../ui/Button.tsx";
/** R34: as quatro primeiras respostas rápidas têm atalho de teclado. */
const SHORTCUT_OPTIONS = 4;

type ComposerProps = {
  /** O campo de texto: o foco volta para ele depois de um botão do card ou de uma opção. */
  ref?: Ref<HTMLInputElement>;
  isBusy: boolean;
  onSend: (text: string) => void;
  /** Contador da sessão (RF10): mensagens ao agent e o limite. */
  counter: { used: number; limit: number };
  /** Respostas rápidas ativas: as teclas 1 a 4 escolhem, com o campo vazio (R34). */
  quickOptions: readonly string[];
  /** R33: Ctrl/⌘+Enter confirma o rascunho pendente, se houver. */
  onConfirmDraft: (() => void) | undefined;
};

/** Campo de mensagem da tela 2, com o contador da sessão e os atalhos de teclado. */
export function Composer({
  ref,
  isBusy,
  onSend,
  counter,
  quickOptions,
  onConfirmDraft,
}: ComposerProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSend = !isBusy && trimmed.length > 0 && trimmed.length <= CHAT_MESSAGE_MAX_CHARS;

  function send(message: string) {
    onSend(message);
    setText("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) send(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && onConfirmDraft) {
      event.preventDefault();
      onConfirmDraft();
      return;
    }
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    const option =
      text === "" && !isBusy && !hasModifier ? quickOptions[Number(event.key) - 1] : undefined;
    if (option && Number(event.key) <= SHORTCUT_OPTIONS) {
      event.preventDefault();
      send(option);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex h-12 items-center gap-2 rounded-lg border border-line-strong bg-paper pr-1.5 pl-4 shadow-field focus-within:border-cta">
        <label htmlFor="composer-input" className="sr-only">
          Mensagem para o Nexo
        </label>
        <input
          id="composer-input"
          ref={ref}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreva para o Nexo…"
          maxLength={CHAT_MESSAGE_MAX_CHARS}
          autoComplete="off"
          aria-describedby="composer-counter"
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-hidden placeholder:text-ink-3"
        />
        <Button type="submit" disabled={!canSend} className="rounded-sm px-3">
          <ArrowUp size={14} aria-hidden />
          Enviar
        </Button>
      </div>
      <p id="composer-counter" className="text-right text-[12.5px] text-ink-3">
        {counter.used}/{counter.limit} mensagens nesta sessão
      </p>
    </form>
  );
}

/**
 * RN14: no limite da sessão, o campo dá lugar às duas saídas: começar uma sessão nova ou falar
 * com um analista (que não depende do agent).
 */
export function SessionLimitNotice({
  isWorking,
  error,
  onNewSession,
  onTalkToAnalyst,
}: {
  isWorking: boolean;
  /** Falha de um dos dois botões; sem ela, o funcionário clicaria sem ver resultado. */
  error: string | null;
  onNewSession: () => void;
  onTalkToAnalyst: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line-strong bg-paper px-4 py-3">
      <div role="status" className="flex flex-col gap-3 md:flex-row md:items-center">
        <p className="flex-1 text-[13.5px] text-ink-2">
          <span className="font-semibold text-ink">Limite desta sessão atingido.</span> Comece uma
          sessão nova para continuar com o assistente, ou fale com um analista.
        </p>
        <div className="flex gap-1.5">
          <Button variant="secondary" onClick={onTalkToAnalyst} disabled={isWorking}>
            Falar com um analista
          </Button>
          <Button onClick={onNewSession} disabled={isWorking}>
            Nova sessão
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
