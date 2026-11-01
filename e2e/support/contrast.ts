/** Cor como o navegador a devolve: `rgb(r, g, b)` ou `rgba(r, g, b, a)`. */
export type Rgba = { r: number; g: number; b: number; a: number };

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const RGB_PATTERN = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/;

export function parseRgba(color: string): Rgba {
  const match = RGB_PATTERN.exec(color);
  if (!match) throw new Error(`Cor não reconhecida: ${color}`);
  const [, r, g, b, a] = match;
  return { r: Number(r), g: Number(g), b: Number(b), a: a === undefined ? 1 : Number(a) };
}

function over(foreground: Rgba, background: Rgba): Rgba {
  const mix = (front: number, back: number) => front * foreground.a + back * (1 - foreground.a);
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste da WCAG entre a cor (com a transparência misturada ao fundo) e o fundo. */
export function contrastRatio(foreground: Rgba, background: Rgba = WHITE): number {
  const [lighter, darker] = [luminance(over(foreground, background)), luminance(background)].sort(
    (first, second) => second - first,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
