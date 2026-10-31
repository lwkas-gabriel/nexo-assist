import { describe, expect, it } from "vitest";
import { createFakeTicketGateway, createTestApp, createTestContainer } from "../test-support.ts";

const ANA_EMAIL = "ana.souza@nexo.com.br";
const BRUNO_EMAIL = "bruno.tavares@nexo.com.br";
const OPEN_TICKET_TEXT = "Quero abrir um chamado: o notebook não liga desde hoje cedo";

type ConversationResponse = {
  messages: { role: string; parts: { type: string; text?: string }[] }[];
};

/** App com o sistema de chamados falso, a Ana e o Bruno logados e ajudantes para o card. */
async function setup() {
  const fake = createFakeTicketGateway();
  const { app, login } = await createTestApp(
    await createTestContainer({ ticketGateway: fake.ticketGateway }),
  );
  const ana = await login(ANA_EMAIL);
  const bruno = await login(BRUNO_EMAIL);

  const request = (cookie: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/chat${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const say = async (cookie: string, text: string) =>
    (await request(cookie, "POST", "/messages", { text })).text();
  const conversationTexts = async (cookie: string) => {
    const { messages } = (await (await request(cookie, "GET", "")).json()) as ConversationResponse;
    return messages.flatMap((message) => message.parts.map((part) => part.text ?? ""));
  };

  return { app, fake, ana, bruno, request, say, conversationTexts };
}

describe("rascunho pelo chat e pelos botões do card (RN04)", () => {
  it("RF15: o agent monta o rascunho, mas nada é criado antes da confirmação", async () => {
    const { ana, say, fake } = await setup();

    const stream = await say(ana, OPEN_TICKET_TEXT);

    expect(stream).toContain("propose_ticket_draft");
    expect(stream).toContain("D-1");
    expect(fake.tickets).toHaveLength(0);
  });

  it("RN04: confirmar pelo botão cria o chamado e registra na conversa", async () => {
    const { ana, say, request, fake, conversationTexts } = await setup();
    await say(ana, OPEN_TICKET_TEXT);

    const response = await request(ana, "POST", "/drafts/D-1/confirm");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ticket: { number: string } };
    expect(fake.tickets.map((ticket) => ticket.number)).toEqual([body.ticket.number]);
    expect(await conversationTexts(ana)).toContain(
      `Rascunho D-1 confirmado: chamado ${body.ticket.number} criado.`,
    );
  });

  it("R04: confirmar digitando, na mensagem seguinte, cria o chamado", async () => {
    const { ana, say, fake } = await setup();
    await say(ana, OPEN_TICKET_TEXT);

    const stream = await say(ana, "Confirmo, pode criar");

    expect(stream).toContain("confirm_draft");
    expect(fake.tickets).toHaveLength(1);
    expect(stream).toContain(`chamado ${fake.tickets[0]?.number} criado`);
  });

  it("confirmar duas vezes responde 409 e não duplica o chamado (R01)", async () => {
    const { ana, say, request, fake } = await setup();
    await say(ana, OPEN_TICKET_TEXT);
    await request(ana, "POST", "/drafts/1/confirm");

    const again = await request(ana, "POST", "/drafts/1/confirm");

    expect(again.status).toBe(409);
    expect(fake.tickets).toHaveLength(1);
  });

  it("RN09: outro funcionário não confirma, edita nem cancela o rascunho (404)", async () => {
    const { ana, bruno, say, request, fake } = await setup();
    await say(ana, OPEN_TICKET_TEXT);

    const statuses = [
      (await request(bruno, "POST", "/drafts/D-1/confirm")).status,
      (await request(bruno, "PATCH", "/drafts/D-1", { affected: "my_team" })).status,
      (await request(bruno, "POST", "/drafts/D-1/cancel")).status,
    ];

    expect(statuses).toEqual([404, 404, 404]);
    expect(fake.tickets).toHaveLength(0);
  });

  it("R16: editar recalcula a prioridade; a prioridade em si não é editável", async () => {
    const { ana, say, request } = await setup();
    await say(ana, OPEN_TICKET_TEXT);

    const edited = await request(ana, "PATCH", "/drafts/D-1", { affected: "my_team" });
    const forced = await request(ana, "PATCH", "/drafts/D-1", { priority: "low" });

    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ draft: { ticket: { priority: "Crítica" } } });
    expect(forced.status).toBe(400);
  });

  it("cancelar descarta o rascunho e registra na conversa", async () => {
    const { ana, say, request, fake, conversationTexts } = await setup();
    await say(ana, OPEN_TICKET_TEXT);

    const cancelled = await request(ana, "POST", "/drafts/D-1/cancel");
    const confirm = await request(ana, "POST", "/drafts/D-1/confirm");

    expect([cancelled.status, confirm.status]).toEqual([200, 409]);
    expect(fake.tickets).toHaveLength(0);
    expect(await conversationTexts(ana)).toContain("Rascunho D-1 cancelado.");
  });

  it("id de rascunho inválido responde 400", async () => {
    const { ana, request } = await setup();

    expect((await request(ana, "POST", "/drafts/qualquer/confirm")).status).toBe(400);
  });

  it("confirmar vindo de outro site é recusado (CSRF)", async () => {
    const { app, ana, say, fake } = await setup();
    await say(ana, OPEN_TICKET_TEXT);

    const response = await app.request("/api/chat/drafts/D-1/confirm", {
      method: "POST",
      headers: { Cookie: ana, Origin: "https://site-malicioso.example" },
    });

    expect(response.status).toBe(403);
    expect(fake.tickets).toHaveLength(0);
  });
});
