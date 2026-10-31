import { describe, expect, it } from "vitest";
import { GENERIC_CHAT_ERROR, describeChatError } from "./chat-error.ts";

describe("describeChatError", () => {
  it("mostra a mensagem da api quando o envio é recusado (ex.: limite de mensagens)", () => {
    const error = new Error(
      JSON.stringify({
        error: { code: "RATE_LIMITED", message: "Muitas mensagens em pouco tempo." },
      }),
    );

    expect(describeChatError(error)).toBe("Muitas mensagens em pouco tempo.");
  });

  it("mostra o aviso do servidor quando a cota do modelo acaba no meio da resposta", () => {
    const text = "O assistente atingiu o limite de uso do modelo de IA por enquanto.";

    expect(describeChatError(new Error(text))).toBe(text);
  });

  it("troca mensagens técnicas do navegador pela mensagem genérica", () => {
    expect(describeChatError(new Error("Failed to fetch"))).toBe(GENERIC_CHAT_ERROR);
  });
});
