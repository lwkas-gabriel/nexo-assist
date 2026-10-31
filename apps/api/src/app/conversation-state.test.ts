import { describe, expect, it } from "vitest";
import { agentMayReply, nextMode } from "./conversation-state.ts";

describe("máquina de estados da conversa (11.3)", () => {
  it("RN07: transferir leva a conversa do agent para a fila de analistas", () => {
    expect(nextMode("agent", "handoff")).toBe("waiting_analyst");
  });

  it("assumir, devolver e encerrar seguem a tabela", () => {
    expect(nextMode("waiting_analyst", "assume")).toBe("analyst");
    expect(nextMode("analyst", "release")).toBe("agent");
    expect(nextMode("waiting_analyst", "release")).toBe("agent");
    expect(nextMode("analyst", "close")).toBe("closed");
  });

  it("transição inválida é recusada com erro tipado", () => {
    expect(() => nextMode("waiting_analyst", "handoff")).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
    expect(() => nextMode("closed", "release")).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });

  it("RN08: o agent só responde com a conversa no modo agent", () => {
    expect(agentMayReply("agent")).toBe(true);
    expect(agentMayReply("waiting_analyst")).toBe(false);
    expect(agentMayReply("analyst")).toBe(false);
  });
});
