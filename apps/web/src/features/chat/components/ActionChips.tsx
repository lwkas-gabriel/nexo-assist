import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { describeToolAction } from "../tool-actions.ts";

/** Ações do agent mostradas acima da resposta (ex.: "buscou na central de ajuda"). */
export function ActionChips({ message }: { message: UIMessage }) {
  const toolParts = message.parts.filter(isToolUIPart);
  if (toolParts.length === 0) return null;

  return (
    <ul className="action-chips" aria-label="Ações do assistente">
      {toolParts.map((part) => (
        <li key={part.toolCallId} className="action-chip">
          {describeToolAction(
            getToolName(part),
            part.state === "output-available" ? part.output : undefined,
          )}
          {part.state === "output-error" && " (falhou)"}
        </li>
      ))}
    </ul>
  );
}
