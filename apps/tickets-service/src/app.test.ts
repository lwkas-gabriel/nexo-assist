import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createTicketService } from "./app/ticket-service.ts";
import { openDatabase } from "./db/database.ts";

const SERVICE_TOKEN = "token-de-teste-com-pelo-menos-32-caracteres";
const ANA = "emp-ana-souza";

const draft = {
  title: "Senha do SAP bloqueada",
  description: "Não consigo entrar no SAP: a senha foi bloqueada depois de 3 tentativas.",
  type: "incident",
  category: "access",
  priority: "medium",
  affected: "just_me",
};

async function createTestApp() {
  const { db } = await openDatabase(":memory:");
  const app = createApp({
    ticketService: createTicketService({
      db,
      clock: { now: () => new Date("2026-10-29T12:00:00Z") },
    }),
    serviceToken: SERVICE_TOKEN,
  });

  const call = (path: string, init: RequestInit = {}, token = SERVICE_TOKEN) =>
    app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
  const post = (path: string, body: unknown) =>
    call(path, { method: "POST", body: JSON.stringify(body) });

  return { app, call, post };
}

describe("tickets-service HTTP", () => {
  it("responde ao health check sem token (monitoramento do deploy)", async () => {
    const { app } = await createTestApp();

    const response = await app.request("/health");

    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("recusa chamada sem o token de serviço (só a api pode chamar)", async () => {
    const { call } = await createTestApp();

    const response = await call(`/tickets?ownerId=${ANA}&filter=all`, {}, "token-errado");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("cria e consulta um chamado", async () => {
    const { call, post } = await createTestApp();

    const created = await post("/tickets", { ownerId: ANA, draft });
    const { number } = (await created.json()) as { number: string };
    const fetched = await call(`/tickets/${number}?ownerId=${ANA}`);

    expect(created.status).toBe(201);
    expect(await fetched.json()).toMatchObject({
      number: "INC-20500",
      title: draft.title,
      status: "new",
    });
  });

  it("RN09: chamado de outro funcionário responde 404, sem revelar que existe", async () => {
    const { call, post } = await createTestApp();
    const created = await post("/tickets", { ownerId: ANA, draft });
    const { number } = (await created.json()) as { number: string };

    const response = await call(`/tickets/${number}?ownerId=emp-bruno-tavares`);

    expect(response.status).toBe(404);
  });

  it("RN03: recusa rascunho incompleto com 400", async () => {
    const { post } = await createTestApp();

    const response = await post("/tickets", {
      ownerId: ANA,
      draft: { ...draft, category: undefined },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("recusa JSON malformado com 400, não 500", async () => {
    const { call } = await createTestApp();

    const response = await call("/tickets", { method: "POST", body: "{ não é json" });

    expect(response.status).toBe(400);
  });

  it("responde 409 ao complementar chamado que não pode ser alterado", async () => {
    const { post } = await createTestApp();
    const created = await post("/tickets", { ownerId: ANA, draft });
    const { number } = (await created.json()) as { number: string };

    const response = await post(`/tickets/${number}/reopen`, { ownerId: ANA });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CONFLICT" } });
  });
});
