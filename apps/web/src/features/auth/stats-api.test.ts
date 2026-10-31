import { describe, expect, it } from "vitest";
import { formatStat } from "./stats-api.ts";

describe("números da tela de login (A11)", () => {
  it("formata em pt-BR e mostra travessão quando ainda não há dado", () => {
    expect(formatStat(8, "s")).toBe("8 s");
    expect(formatStat(3.8, "s")).toBe("3,8 s");
    expect(formatStat(72, "%")).toBe("72%");
    expect(formatStat(null, "%")).toBe("—");
  });
});
