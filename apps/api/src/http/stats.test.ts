import { describe, expect, it } from "vitest";
import { createFakeTicketGateway, createTestApp, createTestContainer } from "../test-support.ts";

type Stats = {
  firstResponseSeconds: number | null;
  resolvedWithoutQueuePercent: number | null;
  analystsOnline: number;
};

async function setup() {
  let now = new Date("2026-10-31T12:00:00Z");
  const clock = { now: () => now };
  const container = await createTestContainer({
    clock,
    ticketGateway: createFakeTicketGateway().ticketGateway,
  });
  const { app, login } = await createTestApp(container);
  const stats = async () => (await (await app.request("/api/stats")).json()) as Stats;
  const sayAs = async (cookie: string, text: string) =>
    (
      await app.request("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ text }),
      })
    ).text();
  const advanceMinutes = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));
  return { stats, login, sayAs, advanceMinutes };
}

describe("números da tela de login (A11)", () => {
  it("A11: sem atendimentos ainda, os números ficam vazios em vez de inventados", async () => {
    const { stats } = await setup();

    expect(await stats()).toEqual({
      firstResponseSeconds: null,
      resolvedWithoutQueuePercent: null,
      analystsOnline: 0,
    });
  });

  it("A11: calculados do banco, sem login e sem dado de pessoa", async () => {
    const { stats, login, sayAs, advanceMinutes } = await setup();
    const ana = await login("ana.souza@nexo.com.br");
    const bruno = await login("bruno.tavares@nexo.com.br");
    await login("rafael.lima@nexo.com.br");
    await sayAs(ana, "Qual o horário do service desk?");
    await sayAs(bruno, "Quero falar com um analista");
    // O cache de 30 s não esconde os números novos depois de passar.
    advanceMinutes(1);

    expect(await stats()).toEqual({
      firstResponseSeconds: 0,
      resolvedWithoutQueuePercent: 50,
      analystsOnline: 1,
    });
  });
});
