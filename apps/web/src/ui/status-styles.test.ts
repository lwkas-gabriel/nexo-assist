import { describe, expect, it } from "vitest";
import { ticketTone } from "./status-styles.ts";

describe("mapa de status (10.2)", () => {
  it("chamado esperando a TI chama atenção; resolvido fica neutro", () => {
    expect(ticketTone("waiting_analyst", false)).toBe("warning");
    expect(ticketTone("resolved", false)).toBe("neutral");
    expect(ticketTone("in_progress", false)).toBe("primary");
  });

  it("RN12: prazo vencido é perigo, qualquer que seja o status", () => {
    expect(ticketTone("in_progress", true)).toBe("danger");
  });
});
