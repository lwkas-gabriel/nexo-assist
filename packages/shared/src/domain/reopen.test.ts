import { describe, expect, it } from "vitest";
import { checkReopen } from "./reopen.ts";

const now = new Date("2026-10-29T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("checkReopen (RN06)", () => {
  it("RN06: reabre chamado resolvido há 4 dias (INC-20150 do Anexo B)", () => {
    expect(checkReopen({ status: "resolved", resolvedAt: daysAgo(4) }, now)).toEqual({
      canReopen: true,
    });
  });

  it("RN06: reabre no limite de exatamente 7 dias", () => {
    expect(checkReopen({ status: "resolved", resolvedAt: daysAgo(7) }, now).canReopen).toBe(true);
  });

  it("RN06: depois de 7 dias, não reabre (abre-se um chamado novo)", () => {
    expect(checkReopen({ status: "resolved", resolvedAt: daysAgo(8) }, now)).toEqual({
      canReopen: false,
      reason: "window_expired",
    });
  });

  it("só chamado resolvido pode ser reaberto (cancelado não)", () => {
    expect(checkReopen({ status: "cancelled", resolvedAt: daysAgo(1) }, now)).toEqual({
      canReopen: false,
      reason: "not_resolved",
    });
  });

  it("sem data de resolução, não arrisca: abre-se um chamado novo", () => {
    expect(checkReopen({ status: "resolved" }, now).canReopen).toBe(false);
  });
});
