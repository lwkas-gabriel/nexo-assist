import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contraste dos tokens (WCAG 2.x, 10.7), lido do próprio `tokens.css`: mudar uma cor do tema que
 * derrube um par abaixo do mínimo quebra aqui, antes do axe do E2E. Só entram os pares que a
 * tela usa de verdade; a regra das pílulas sobre `desk` e `console` (10.7) fica de fora de
 * propósito, porque ali o texto de tom já está abaixo de 4,5:1 e a etiqueta ganha fundo `paper`.
 */
const TEXT_MIN_RATIO = 4.5;
/** Contornos de foco e bordas de componente (WCAG 1.4.11). */
const COMPONENT_MIN_RATIO = 3;

type Rgba = { r: number; g: number; b: number; a: number };

function readColorTokens(): Record<string, Rgba> {
  const css = readFileSync(join(import.meta.dirname, "..", "styles", "tokens.css"), "utf8");
  const tokens: Record<string, Rgba> = {};
  for (const [, name, hex] of css.matchAll(/--color-([a-z0-9-]+):\s*#([0-9a-fA-F]{6,8});/g)) {
    if (!name || !hex) continue;
    const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
    tokens[name] = {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: hex.length === 8 ? channel(6) / 255 : 1,
    };
  }
  return tokens;
}

const TOKENS = readColorTokens();

function token(name: string): Rgba {
  const color = TOKENS[name];
  if (!color) throw new Error(`Token de cor desconhecido: ${name}`);
  return color;
}

/** A cor com a transparência já misturada ao fundo (os tons suaves das pílulas têm alfa). */
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

/** Razão de contraste da WCAG de uma cor sobre outra, cada uma pelo nome do token. */
function ratio(foreground: string, background: string, backdrop = "paper"): number {
  const base = token(backdrop);
  const back = over(token(background), base);
  const front = over(token(foreground), back);
  const [lighter = 0, darker = 0] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("contraste dos tokens (10.7)", () => {
  it("lê os tokens do tema (a leitura do CSS não está vazia)", () => {
    expect(Object.keys(TOKENS).length).toBeGreaterThan(30);
    expect(ratio("ink", "paper")).toBeGreaterThan(15);
  });

  describe("texto de leitura", () => {
    const readingBackgrounds = ["paper", "desk", "console"];
    for (const text of ["ink", "ink-2", "ink-3"]) {
      for (const background of readingBackgrounds) {
        it(`${text} sobre ${background} passa de ${TEXT_MIN_RATIO}:1`, () => {
          expect(ratio(text, background)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
        });
      }
    }

    for (const bubble of ["bubble-agent", "bubble-analyst"]) {
      it(`ink sobre a bolha ${bubble} passa de ${TEXT_MIN_RATIO}:1`, () => {
        expect(ratio("ink", bubble)).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
      });
    }

    it("texto branco no botão e na etiqueta de fundo cta passa", () => {
      expect(ratio("paper", "cta")).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
    });

    it("texto branco no fundo ink (resposta do analista, painel de apresentação) passa", () => {
      expect(ratio("paper", "ink")).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
    });

    it("link e atalho em primary-text sobre paper passa", () => {
      expect(ratio("primary-text", "paper")).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
    });
  });

  describe("pílulas sobre paper (a regra do 10.7)", () => {
    const pills = [
      ["primary-text", "primary-soft"],
      ["success-text", "success-soft"],
      ["warning-text", "warning-soft"],
      ["danger-text", "danger-soft"],
    ] as const;
    for (const [text, soft] of pills) {
      it(`${text} sobre ${soft} passa de ${TEXT_MIN_RATIO}:1`, () => {
        expect(ratio(text, soft, "paper")).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
      });
    }

    it("a pílula neutra (ink-3 sobre desk) passa", () => {
      expect(ratio("ink-3", "desk")).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
    });

    for (const tone of ["success", "warning", "danger"]) {
      it(`${tone}-text sobre paper (texto de status solto) passa`, () => {
        expect(ratio(`${tone}-text`, "paper")).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
      });
    }
  });

  describe("avatares", () => {
    const tones = ["blue", "orange", "violet", "green", "pink", "gray", "yellow"];
    for (const tone of tones) {
      it(`iniciais ${tone} passam de ${TEXT_MIN_RATIO}:1 sobre o próprio fundo`, () => {
        expect(ratio(`avatar-${tone}-text`, `avatar-${tone}`)).toBeGreaterThanOrEqual(
          TEXT_MIN_RATIO,
        );
      });
    }
  });

  describe("componentes e foco (WCAG 1.4.11)", () => {
    for (const background of ["paper", "desk", "console"]) {
      it(`o contorno de foco (primary) sobre ${background} passa de ${COMPONENT_MIN_RATIO}:1`, () => {
        expect(ratio("primary", background)).toBeGreaterThanOrEqual(COMPONENT_MIN_RATIO);
      });
    }

    it("a borda de foco e o contorno do item selecionado (cta) sobre paper passam", () => {
      expect(ratio("cta", "paper")).toBeGreaterThanOrEqual(COMPONENT_MIN_RATIO);
    });
  });
});
