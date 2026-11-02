import { cx } from "../../../ui/cx.ts";
import type { QuickOptions as QuickOptionsData } from "../chat-model.ts";

/**
 * RF06: pergunta com respostas rápidas, numeradas (teclas 1 a 4 com o campo de mensagem vazio,
 * R34). Só a pergunta mais recente aceita resposta; as antigas ficam como registro.
 */
export function QuickOptions({
  data,
  isActive,
  onPick,
}: {
  data: QuickOptionsData;
  isActive: boolean;
  onPick: (option: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14.5px] font-semibold text-ink">{data.question}</p>
      <ul aria-label="Respostas rápidas" className="flex flex-wrap gap-1.5">
        {data.options.map((option, index) => (
          <li key={option}>
            <button
              type="button"
              disabled={!isActive}
              onClick={() => onPick(option)}
              aria-keyshortcuts={isActive && index < 4 ? String(index + 1) : undefined}
              className={cx(
                "inline-flex items-center gap-[7px] rounded-md border px-3 py-[7px] text-[13.5px] font-medium",
                "enabled:hover:border-primary enabled:hover:bg-primary-soft enabled:hover:text-primary-text",
                "border-rule bg-paper text-ink disabled:cursor-default disabled:text-ink-3",
              )}
            >
              {isActive && index < 4 && (
                <span aria-hidden className="font-data text-[11px] text-ink-3">
                  {index + 1}
                </span>
              )}
              {option}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
