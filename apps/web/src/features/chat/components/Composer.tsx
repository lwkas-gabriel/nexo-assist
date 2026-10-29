import { useState, type FormEvent } from "react";

/** Mesmo limite que a api aplica, para avisar antes de enviar. */
const MAX_MESSAGE_CHARS = 2000;

type ComposerProps = {
  isBusy: boolean;
  onSend: (text: string) => void;
};

export function Composer({ isBusy, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSend = !isBusy && trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_CHARS;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label htmlFor="composer-input" className="visually-hidden">
        Mensagem para o Nexo
      </label>
      <input
        id="composer-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Escreva para o Nexo…"
        maxLength={MAX_MESSAGE_CHARS}
        autoComplete="off"
      />
      <button type="submit" disabled={!canSend}>
        Enviar
      </button>
    </form>
  );
}
