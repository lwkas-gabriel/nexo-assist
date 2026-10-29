import { isTextUIPart, type UIMessage } from "ai";
import { ActionChips } from "./ActionChips.tsx";

export function MessageBubble({ message }: { message: UIMessage }) {
  const isAgent = message.role === "assistant";
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

  return (
    <li className={isAgent ? "message message--agent" : "message message--employee"}>
      {isAgent && <span className="message__sender">Nexo Assist</span>}
      {isAgent && <ActionChips message={message} />}
      {text && <p className="message__text">{text}</p>}
    </li>
  );
}
