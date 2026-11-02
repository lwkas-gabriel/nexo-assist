import { describe, expect, it } from "vitest";
import { createContainer } from "./container.ts";
import { testConfig } from "./test-support.ts";

const EMPLOYEE_EMAILS = [
  "ana.souza@nexo.com.br",
  "bruno.tavares@nexo.com.br",
  "carla.mendes@nexo.com.br",
  "diego.ramos@nexo.com.br",
];
const SAME_IP = "203.0.113.7";

/**
 * Manda mensagens do mesmo IP, uma conta de cada vez (cada uma tem o limite próprio de 30 por
 * hora), e devolve quantas o agent aceitou antes de a cota por IP recusar.
 */
async function acceptedBeforeLimit(config: Parameters<typeof testConfig>[0]) {
  const container = await createContainer(testConfig(config));
  let accepted = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const email = EMPLOYEE_EMAILS[attempt % EMPLOYEE_EMAILS.length] ?? "";
    const { user } = await container.authService.login({ email, password: "x", remember: false });
    try {
      const stream = await container.chatService.sendMessage(user, "oi", { ip: SAME_IP });
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        // lê o turno até o fim: a conversa só aceita outra mensagem depois
      }
      accepted++;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "RATE_LIMITED")
        return accepted;
      throw error;
    }
  }
  throw new Error("A cota por IP nunca recusou");
}

describe("tetos de mensagens por IP (A13)", () => {
  it("sem configuração, o padrão é 40 por dia", async () => {
    expect(await acceptedBeforeLimit({})).toBe(40);
  });

  it("o teto diário configurado vale no lugar do padrão", async () => {
    expect(await acceptedBeforeLimit({ CHAT_MESSAGES_PER_IP_PER_DAY: 3 })).toBe(3);
  });

  it("sem configuração, o padrão é 60 por hora (com o teto diário alto)", async () => {
    expect(await acceptedBeforeLimit({ CHAT_MESSAGES_PER_IP_PER_DAY: 1000 })).toBe(60);
  });

  it("o teto por hora configurado vale no lugar do padrão", async () => {
    expect(
      await acceptedBeforeLimit({
        CHAT_MESSAGES_PER_IP_PER_DAY: 1000,
        CHAT_MESSAGES_PER_IP_PER_HOUR: 2,
      }),
    ).toBe(2);
  });
});
