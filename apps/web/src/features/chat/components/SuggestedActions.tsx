import { cx } from "../../../ui/cx.ts";

export type SuggestedAction = "analyst" | "add_info" | "decline";

const ACTION_LABELS: Record<SuggestedAction, string> = {
  analyst: "Falar com um analista",
  add_info: "Adicionar informação",
  decline: "Não, obrigado",
};

/**
 * Tela 3: a oferta de analista para um chamado vencido (RN07, A04), com as saídas do protótipo.
 * Cada uma é uma ação estruturada (11.5): nenhuma passa pelo modelo.
 */
export function SuggestedActions({
  isActive,
  onAction,
}: {
  isActive: boolean;
  onAction: (action: SuggestedAction) => void;
}) {
  return (
    <ul aria-label="O que fazer agora" className="flex flex-wrap gap-1.5">
      {(Object.keys(ACTION_LABELS) as SuggestedAction[]).map((action) => (
        <li key={action}>
          <button
            type="button"
            disabled={!isActive}
            onClick={() => onAction(action)}
            className={cx(
              "inline-flex items-center rounded-md border px-3 py-[7px] text-[13.5px] font-medium",
              "enabled:hover:border-primary enabled:hover:bg-primary-soft enabled:hover:text-primary-text",
              "border-rule bg-paper text-ink disabled:cursor-default disabled:text-ink-3",
            )}
          >
            {ACTION_LABELS[action]}
          </button>
        </li>
      ))}
    </ul>
  );
}
