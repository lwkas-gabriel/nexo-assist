import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import { useBreakpoint, type Breakpoint } from "../lib/use-breakpoint.ts";
import { cx } from "./cx.ts";
import { IconButton } from "./IconButton.tsx";

type SidePanelProps = {
  title: string;
  /** Id do painel, para o botão que o abre apontar para ele (`aria-controls`). */
  id?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * A partir de que largura o painel é uma coluna do layout, ao lado do conteúdo. Abaixo disso,
   * vira gaveta sobreposta (tablet e notebook) ou, no celular, folha ou tela cheia. "never": sempre
   * sobreposto, para telas sem espaço para uma coluna a mais (ex.: o login, já com duas colunas).
   */
  inlineFrom?: Extract<Breakpoint, "laptop" | "desktop"> | "never";
  /**
   * No celular: folha que sobe de baixo (detalhe da decisão) ou tela cheia (o console mostra uma
   * coluna por vez, 10.6).
   */
  mobileMode?: "sheet" | "fullscreen";
  /** Largura da coluna ou da gaveta, como no protótipo (ex.: 340 px no painel de chamados). */
  widthClass?: string;
};

const INLINE_FROM: Record<NonNullable<SidePanelProps["inlineFrom"]>, Breakpoint[]> = {
  laptop: ["laptop", "desktop"],
  desktop: ["desktop"],
  never: [],
};

/**
 * Painel lateral único (10.6): o detalhe da decisão no chat e o painel de chamados no console.
 * Os mesmos componentes em todas as larguras, sem versão mobile separada.
 */
export function SidePanel({
  title,
  id,
  open,
  onClose,
  children,
  inlineFrom = "desktop",
  mobileMode = "sheet",
  widthClass = "w-[340px]",
}: SidePanelProps) {
  const breakpoint = useBreakpoint();
  const titleId = useId();

  if (!open) return null;

  if (INLINE_FROM[inlineFrom].includes(breakpoint)) {
    return (
      <InlinePanel
        id={id}
        title={title}
        titleId={titleId}
        onClose={onClose}
        widthClass={widthClass}
      >
        {children}
      </InlinePanel>
    );
  }

  const placement =
    breakpoint !== "mobile"
      ? cx("inset-y-0 right-0 max-w-[90vw]", widthClass)
      : mobileMode === "sheet"
        ? "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl"
        : "inset-0";

  return (
    <OverlayPanel id={id} title={title} titleId={titleId} onClose={onClose} placement={placement}>
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
  closeRef?: Ref<HTMLButtonElement>;
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

/**
 * Coluna ao lado do conteúdo. Ao abrir, o foco vai para o botão de fechar: o painel costuma vir
 * depois de tudo na ordem do Tab, e sem isso quem usa teclado atravessaria a página para chegar
 * nele. Esc fecha, como na gaveta. Para mostrar outro conteúdo com o foco de novo no painel, o
 * pai troca a `key`.
 */
function InlinePanel({
  id,
  title,
  titleId,
  onClose,
  widthClass,
  children,
}: {
  id: string | undefined;
  title: string;
  titleId: string;
  onClose: () => void;
  widthClass: string;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <aside
      id={id}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className={cx("flex shrink-0 flex-col border-l border-rule bg-paper", widthClass)}
    >
      <PanelHeader titleId={titleId} title={title} onClose={onClose} closeRef={closeRef} />
      <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
    </aside>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** O Tab dá a volta dentro do painel, sem chegar ao conteúdo atrás do fundo escuro. */
function trapTab(event: KeyboardEvent, container: HTMLElement) {
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Gaveta, folha ou tela cheia sobreposta, modal de verdade: prende o Tab, fecha com Esc ou
 * clique fora, trava a rolagem do fundo e devolve o foco a quem abriu ao fechar.
 */
function OverlayPanel({
  id,
  title,
  titleId,
  onClose,
  placement,
  children,
}: {
  id: string | undefined;
  title: string;
  titleId: string;
  onClose: () => void;
  placement: string;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // O pai costuma passar uma função nova a cada renderização (ex.: o polling do console). Lida por
  // ref, ela não refaz os efeitos abaixo, que mexeriam no foco de quem está digitando no painel.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Só ao abrir e ao fechar: guarda o foco, foca o botão de fechar e trava a rolagem do fundo.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab" && dialogRef.current) trapTab(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden
        className="absolute inset-0 bg-ink/40"
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("absolute flex flex-col bg-paper shadow-card", placement)}
      >
        <PanelHeader titleId={titleId} title={title} onClose={onClose} closeRef={closeRef} />
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
