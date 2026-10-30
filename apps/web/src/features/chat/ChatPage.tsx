import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai";
import { fetchConversation } from "./chat-api.ts";
import { describeChatError } from "./chat-error.ts";
import { Composer } from "./components/Composer.tsx";
import { MessageBubble } from "./components/MessageBubble.tsx";

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

/** Carrega a conversa salva antes de mostrar o chat (voltar outro dia e continuar, RF11). */
export function ChatPage() {
  const conversation = useQuery({ queryKey: ["conversation"], queryFn: fetchConversation });

  if (conversation.isPending) {
    return <p className="chat__status">Carregando sua conversa…</p>;
  }
  if (conversation.error) {
    return (
      <div className="chat__error" role="alert">
        <p>{conversation.error.message}</p>
        <button type="button" onClick={() => void conversation.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  }
  return <ChatConversation initialMessages={conversation.data.messages} />;
}

/**
 * Esqueleto do chat do funcionário: conversa com o agent em tempo real.
 * Layout e estilo do protótipo entram na T19.
 */
function ChatConversation({ initialMessages }: { initialMessages: UIMessage[] }) {
  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport: chatTransport,
    messages: initialMessages,
  });
  const isBusy = status === "submitted" || status === "streaming";

  return (
    <>
      <ol className="chat__messages" aria-live="polite">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ol>

      {status === "submitted" && <p className="chat__status">Nexo Assist está pensando…</p>}

      {error && (
        <div className="chat__error" role="alert">
          <p>{describeChatError(error)}</p>
          <button type="button" onClick={() => void regenerate()}>
            Tentar novamente
          </button>
        </div>
      )}

      <Composer isBusy={isBusy} onSend={(text) => void sendMessage({ text })} />
    </>
  );
}
