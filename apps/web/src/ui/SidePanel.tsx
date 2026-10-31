import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useBreakpoint, type Breakpoint } from "../lib/use-breakpoint.ts";
import { cx } from "./cx.ts";
import { IconButton } from "./IconButton.tsx";

type SidePanelProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * A partir de que largura o painel é uma coluna do layout, ao lado do conteúdo. Abaixo disso,
   * vira gaveta sobreposta (tablet e notebook) ou folha que sobe de baixo (celular).
   */
  inlineFrom?: Extract<Breakpoint, "laptop" | "desktop">;
  /** Largura da coluna ou da gaveta, como no protótipo (ex.: 340 px no painel de chamados). */
  widthClass?: string;
};

const INLINE_FROM: Record<NonNullable<SidePanelProps["inlineFrom"]>, Breakpoint[]> = {
  laptop: ["laptop", "desktop"],
  desktop: ["desktop"],
};

/**
 * Painel lateral único (10.6): o detalhe da decisão no chat e o painel de chamados no console.
 * Os mesmos componentes em todas as larguras, sem versão mobile separada.
 */
export function SidePanel({
  title,
  open,
  onClose,
  children,
  inlineFrom = "desktop",
  widthClass = "w-[340px]",
}: SidePanelProps) {
  const breakpoint = useBreakpoint();
  const titleId = useId();
  const isInline = INLINE_FROM[inlineFrom].includes(breakpoint);

  if (!open) return null;

  if (isInline) {
    return (
      <aside
        aria-labelledby={titleId}
        className={cx("flex shrink-0 flex-col border-l border-rule bg-paper", widthClass)}
      >
        <PanelHeader titleId={titleId} title={title} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </aside>
    );
  }

  return (
    <OverlayPanel
      title={title}
      titleId={titleId}
      onClose={onClose}
      isSheet={breakpoint === "mobile"}
      widthClass={widthClass}
    >
      {children}
    </OverlayPanel>
  );
}

function PanelHeader({
  titleId,
  title,
  onClose,
  closeRef,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  closeRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <header className="flex items-center justify-between px-5 py-4">
      <h2 id={titleId} className="text-[15px] font-semibold text-ink">
        {title}
      </h2>
      <IconButton
        ref={closeRef}
        label={`Fechar ${title}`}
        icon={<X size={18} />}
        onClick={onClose}
      />
    </header>
  );
}

/** Gaveta ou folha sobreposta: modal, fecha com Esc ou clique fora, e devolve o foco ao sair. */
function OverlayPanel({
  title,
  titleId,
  onClose,
  isSheet,
  widthClass,
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  isSheet: boolean;
  widthClass: string;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "absolute flex flex-col bg-paper shadow-card",
          isSheet
            ? "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl"
            : cx("inset-y-0 right-0 max-w-[90vw]", widthClass),
        )}
      >
        <PanelHeader titleId={titleId} title={title} onClose={onClose} closeRef={closeRef} />
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
