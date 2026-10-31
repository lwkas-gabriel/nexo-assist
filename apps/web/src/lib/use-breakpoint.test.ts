import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BREAKPOINT_MIN_WIDTHS, currentBreakpoint } from "./use-breakpoint.ts";

const at = (width: number) =>
  currentBreakpoint((query) => width >= Number(/(\d+)px/.exec(query)?.[1] ?? Infinity));

describe("faixas de largura (10.6)", () => {
  it("limites exatos: 768, 1024 e 1280 px", () => {
    expect([767, 768, 1023, 1024, 1279, 1280].map(at)).toEqual([
      "mobile",
      "tablet",
      "tablet",
      "laptop",
      "laptop",
      "desktop",
    ]);
  });

  it("são os mesmos breakpoints do tema do Tailwind (um não muda sem o outro)", () => {
    const tokens = readFileSync(join(import.meta.dirname, "..", "styles", "tokens.css"), "utf8");

    expect(tokens).toContain(`--breakpoint-md: ${BREAKPOINT_MIN_WIDTHS.tablet}px;`);
    expect(tokens).toContain(`--breakpoint-lg: ${BREAKPOINT_MIN_WIDTHS.laptop}px;`);
    expect(tokens).toContain(`--breakpoint-xl: ${BREAKPOINT_MIN_WIDTHS.desktop}px;`);
  });
});
