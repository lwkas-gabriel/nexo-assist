import { isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { ActionChips } from "./ActionChips.tsx";

/** Quem escreveu, como a api manda nos metadados da mensagem (agent, analista ou sistema). */
function authorOf(message: UIMessage): string | undefined {
  const metadata = message.metadata;
  if (typeof metadata !== "object" || metadata === null || !("author" in metadata))
    return undefined;
  return typeof metadata.author === "string" ? metadata.author : undefined;
}

export function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
  // Com a conversa com um analista, o agent não responde: não há bolha a mostrar (RN08).
  if (!text && !message.parts.some(isToolUIPart)) return null;

  if (authorOf(message) === "system") {
    return <li className="message message--system">{text}</li>;
  }

  const isAgent = message.role === "assistant";
  // Mensagem de analista também vem como "assistant": o autor diz quem falou de fato.
  const isAnalyst = authorOf(message) === "analyst";
  return (
    <li className={isAgent ? "message message--agent" : "message message--employee"}>
      {isAgent && (
        <span className="message__sender">{isAnalyst ? "Analista de TI" : "Nexo Assist"}</span>
      )}
      {isAgent && !isAnalyst && <ActionChips message={message} />}
      {text && <p className="message__text">{text}</p>}
    </li>
  );
}
