import { describe, expect, it } from "vitest";
import { isMacPlatform, modifierKeyLabel } from "./platform.ts";

describe("atalho conforme o sistema (R33)", () => {
  it("R33: ⌘ no Mac, Ctrl nos demais", () => {
    expect(modifierKeyLabel(true)).toBe("⌘");
    expect(modifierKeyLabel(false)).toBe("Ctrl");
  });

  it("reconhece o Mac pelo navegador", () => {
    expect(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe(true);
    expect(isMacPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
