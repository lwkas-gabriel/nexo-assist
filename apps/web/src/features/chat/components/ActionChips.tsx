import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { describeToolAction } from "../tool-actions.ts";

/**
 * Linha de status da resposta (RF04): "Nexo Assist" e o que o agent fez. Os chips aparecem um a
 * um, conforme as tools rodam: girando enquanto rodam, com ✓ quando terminam (10.5).
 */
export function ActionChips({ message }: { message: UIMessage }) {
  const toolParts = message.parts.filter(isToolUIPart);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[12.5px] font-semibold text-ink">Nexo Assist</span>
      {toolParts.length > 0 && (
        <ul
          aria-label="Ações do assistente"
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          {toolParts.map((part) => {
            const isRunning = part.state === "input-streaming" || part.state === "input-available";
            const failed = part.state === "output-error";
            return (
              <li
                key={part.toolCallId}
                className="flex items-center gap-[5px] text-[12.5px] text-ink-3"
              >
                {isRunning ? (
                  <LoaderCircle aria-hidden size={12} className="animate-spin" />
                ) : failed ? (
                  <TriangleAlert aria-hidden size={12} className="text-danger-text" />
                ) : (
                  <Check aria-hidden size={12} />
                )}
                <span>
                  {describeToolAction(
                    getToolName(part),
                    part.state === "output-available" ? part.output : undefined,
                  )}
                </span>
                {failed && <span>(falhou)</span>}
                {isRunning && <span className="sr-only">(em andamento)</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
