import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Check, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { describeToolAction } from "../tool-actions.ts";

type ActionChipsProps = {
  message: UIMessage;
  /**
   * Abre o detalhe da decisão (RF05, 10.4). Só vem quando a resposta já tem o registro (depois
   * de gravada); durante o streaming, os chips são só a linha de status.
   */
  onOpenDecision?: ((opener: HTMLElement) => void) | undefined;
  isDecisionOpen?: boolean;
};

/**
 * Linha de status da resposta (RF04): "Nexo Assist" e o que o agent fez. Os chips aparecem um a
 * um, conforme as tools rodam: girando enquanto rodam, com ✓ quando terminam (10.5). Com o
 * registro pronto, um botão no fim da linha abre o detalhe da decisão.
 */
export function ActionChips({ message, onOpenDecision, isDecisionOpen = false }: ActionChipsProps) {
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
      {onOpenDecision && (
        <button
          type="button"
          onClick={(event) => onOpenDecision(event.currentTarget)}
          aria-expanded={isDecisionOpen}
          // O nome contém o texto visível (WCAG 2.5.3) e diz o que abre.
          aria-label="detalhes da decisão"
          className="flex items-center gap-0.5 rounded-sm text-[12.5px] font-medium text-primary-text hover:underline"
        >
          detalhes
          <ChevronRight aria-hidden size={12} />
        </button>
      )}
    </div>
  );
}
