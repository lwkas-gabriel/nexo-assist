import { describe, expect, it } from "vitest";
import { TICKET_STATUS_TONES, priorityDotClass } from "./status-styles.ts";

describe("mapa de status (10.2)", () => {
  it("chamado esperando a TI chama atenção; resolvido fica neutro", () => {
    expect(TICKET_STATUS_TONES.waiting_analyst).toBe("warning");
    expect(TICKET_STATUS_TONES.resolved).toBe("neutral");
    expect(TICKET_STATUS_TONES.in_progress).toBe("primary");
  });

  it("o ponto da prioridade segue o rótulo; desconhecido fica neutro", () => {
    expect(priorityDotClass("Crítica")).toBe("bg-danger");
    expect(priorityDotClass("Outra")).toBe("bg-ink-3");
  });
});
