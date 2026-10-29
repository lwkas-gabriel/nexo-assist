import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Composer } from "./components/Composer.tsx";
import { MessageBubble } from "./components/MessageBubble.tsx";

const chatTransport = new DefaultChatTransport({ api: "/api/chat" });

/**
 * Esqueleto do chat do funcionário (T02b): conversa com o agent em tempo real.
 * Layout e estilo do protótipo entram na T19.
 */
export function ChatPage() {
  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport: chatTransport,
  });
  const isBusy = status === "submitted" || status === "streaming";

  return (
    <main className="chat">
      <header className="chat__header">
        <h1>Nexo Assist</h1>
        <p>Service desk de TI da Nexo</p>
      </header>

      <ol className="chat__messages" aria-live="polite">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ol>

      {status === "submitted" && <p className="chat__status">Nexo Assist está pensando…</p>}

      {error && (
        <div className="chat__error" role="alert">
          <p>Não consegui responder agora. Tente novamente em instantes.</p>
          <button type="button" onClick={() => void regenerate()}>
            Tentar novamente
          </button>
        </div>
      )}

      <Composer isBusy={isBusy} onSend={(text) => void sendMessage({ text })} />
    </main>
  );
}
