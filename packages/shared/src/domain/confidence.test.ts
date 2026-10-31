import { describe, expect, it } from "vitest";
import { HIGH_CONFIDENCE, LOW_CONFIDENCE_THRESHOLD, confidenceLevel } from "./confidence.ts";

describe("faixas de confiança (R09, R39)", () => {
  it("R39: abaixo de 0,5 é baixa; o próprio limiar já é média", () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.5);
    expect(confidenceLevel(0.4999)).toBe("baixa");
    expect(confidenceLevel(0.5)).toBe("média");
  });

  it("a partir de 0,8 é alta", () => {
    expect(HIGH_CONFIDENCE).toBe(0.8);
    expect(confidenceLevel(0.7999)).toBe("média");
    expect(confidenceLevel(0.8)).toBe("alta");
    expect(confidenceLevel(1)).toBe("alta");
  });

  it("os extremos ficam nas pontas", () => {
    expect(confidenceLevel(0)).toBe("baixa");
  });
});
