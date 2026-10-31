/** Cores da marca: no painel escuro, como no protótipo (branco); em fundo claro, bloco azul e balão branco. */
const TONES = {
  onDark: { block: "fill-paper/70", bubble: "fill-paper" },
  onLight: { block: "fill-cta", bubble: "fill-paper" },
} as const;

/**
 * Marca do Nexo Assist: um bloco com um balão de conversa por cima. Decorativa: o nome
 * "Nexo Assist" vem sempre ao lado, em texto.
 */
export function NexoMark({ tone = "onDark" }: { tone?: keyof typeof TONES }) {
  const colors = TONES[tone];
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0">
      <rect x="0" y="2" width="24" height="20" rx="5" className={colors.block} />
      <path
        d="M6 8.5h12a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-6l-3.5 3v-3H6A1.5 1.5 0 0 1 4.5 14v-4A1.5 1.5 0 0 1 6 8.5Z"
        className={colors.bubble}
      />
    </svg>
  );
}
