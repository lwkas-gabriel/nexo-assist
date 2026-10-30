import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createTicketService } from "./app/ticket-service.ts";
import { openDatabase } from "./db/database.ts";

const SERVICE_TOKEN = randomUUID() + randomUUID();
const ANA = "emp-ana-souza";

const draft = {
  title: "Senha do SAP bloqueada",
  description: "Não consigo entrar no SAP: a senha foi bloqueada depois de 3 tentativas.",
  type: "incident",
  category: "access",
  priority: "medium",
  affected: "just_me",
};

type TestAppOptions = { failureRate?: number; rolls?: number[] };

/** App com banco em memória. `rolls` controla a sorte da simulação de falhas, requisição a requisição. */
async function createTestApp({ failureRate = 0, rolls = [] }: TestAppOptions = {}) {
  const { db } = await openDatabase(":memory:");
  const clock = { now: () => new Date("2026-10-29T12:00:00Z") };
  const pendingRolls = [...rolls];
  const app = createApp({
    ticketService: createTicketService({ db, clock }),
    db,
    clock,
    serviceToken: SERVICE_TOKEN,
    failureRate,
    random: () => pendingRolls.shift() ?? 1,
  });

  const call = (path: string, init: RequestInit = {}, headers: Record<string, string> = {}) =>
    app.request(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        ...headers,
      },
    });
  const post = (path: string, body: unknown, idempotencyKey: string = randomUUID()) =>
    call(
      path,
      { method: "POST", body: JSON.stringify(body) },
      { "Idempotency-Key": idempotencyKey },
    );
  const countAnaTickets = async () => {
    const response = await call(`/tickets?ownerId=${ANA}&filter=all`);
    return ((await response.json()) as { tickets: unknown[] }).tickets.length;
  };

  return { app, call, post, countAnaTickets };
}

describe("tickets-service HTTP", () => {
  it("responde ao health check sem token (monitoramento do deploy)", async () => {
    const { app } = await createTestApp();

    const response = await app.request("/health");

    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("recusa chamada sem o token de serviço (só a api pode chamar)", async () => {
    const { call } = await createTestApp();

    const response = await call(
      `/tickets?ownerId=${ANA}&filter=all`,
      {},
      { Authorization: "Bearer errado" },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("cria e consulta um chamado", async () => {
    const { call, post } = await createTestApp();

    const created = await post("/tickets", { ownerId: ANA, draft });
    const { number } = (await created.json()) as { number: string };
    const fetched = await call(`/tickets/${number}?ownerId=${ANA}`);

    expect(created.status).toBe(201);
    expect(await fetched.json()).toMatchObject({ number: "INC-20500", title: draft.title });
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

    const response = await call(
      "/tickets",
      { method: "POST", body: "{ não é json" },
      { "Idempotency-Key": randomUUID() },
    );

    expect(response.status).toBe(400);
  });

  it("responde 409 ao reabrir chamado que não está resolvido", async () => {
    const { post } = await createTestApp();
    const created = await post("/tickets", { ownerId: ANA, draft });
    const { number } = (await created.json()) as { number: string };

    const response = await post(`/tickets/${number}/reopen`, { ownerId: ANA });

    expect(response.status).toBe(409);
  });
});

describe("idempotência (R01)", () => {
  it("exige Idempotency-Key em toda escrita", async () => {
    const { call } = await createTestApp();

    const response = await call("/tickets", {
      method: "POST",
      body: JSON.stringify({ ownerId: ANA, draft }),
    });

    expect(response.status).toBe(400);
  });

  it("repetir a mesma chave devolve a resposta original, sem criar outro chamado", async () => {
    const { post, countAnaTickets } = await createTestApp();
    const key = randomUUID();

    const first = await post("/tickets", { ownerId: ANA, draft }, key);
    const repeated = await post("/tickets", { ownerId: ANA, draft }, key);

    expect(repeated.status).toBe(201);
    expect(await repeated.json()).toEqual(await first.json());
    expect(await countAnaTickets()).toBe(1);
  });

  it("recusa reaproveitar a chave em outra operação", async () => {
    const { post } = await createTestApp();
    const key = randomUUID();
    const created = await post("/tickets", { ownerId: ANA, draft }, key);
    const { number } = (await created.json()) as { number: string };

    const response = await post(
      `/tickets/${number}/updates`,
      { ownerId: ANA, author: "employee", message: "oi" },
      key,
    );

    expect(response.status).toBe(409);
  });

  it("R01: duas escritas simultâneas com a mesma chave criam um único chamado", async () => {
    const { post, countAnaTickets } = await createTestApp();
    const key = randomUUID();

    const responses = await Promise.all([
      post("/tickets", { ownerId: ANA, draft }, key),
      post("/tickets", { ownerId: ANA, draft }, key),
    ]);

    // Uma executa; a outra recebe a resposta guardada ou 503 (ainda em andamento, o retry resolve).
    expect(responses.map((response) => response.status).sort()).toEqual(
      expect.arrayContaining([201]),
    );
    expect(responses.every((response) => [201, 503].includes(response.status))).toBe(true);
    expect(await countAnaTickets()).toBe(1);
  });

  it("recusa a mesma chave com outro conteúdo, em vez de devolver o resultado antigo", async () => {
    const { post, countAnaTickets } = await createTestApp();
    const key = randomUUID();
    await post("/tickets", { ownerId: ANA, draft }, key);

    const changed = await post(
      "/tickets",
      { ownerId: ANA, draft: { ...draft, title: "Outro título" } },
      key,
    );

    expect(changed.status).toBe(409);
    expect(await countAnaTickets()).toBe(1);
  });
});

describe("legado instável (simulação de falhas)", () => {
  it("falha antes de processar: 503 e nada é gravado", async () => {
    const { post, countAnaTickets } = await createTestApp({ failureRate: 0.5, rolls: [0.1] });

    const response = await post("/tickets", { ownerId: ANA, draft });

    expect(response.status).toBe(503);
    expect(await countAnaTickets()).toBe(0);
  });

  it("R01: falha depois de gravar + retry com a mesma chave = um único chamado", async () => {
    // 0.4 < taxa: a operação é gravada mas a resposta "se perde"; 0.9: o retry passa.
    const { post, countAnaTickets } = await createTestApp({ failureRate: 0.5, rolls: [0.4, 0.9] });
    const key = randomUUID();

    const lost = await post("/tickets", { ownerId: ANA, draft }, key);
    const retried = await post("/tickets", { ownerId: ANA, draft }, key);

    expect(lost.status).toBe(503);
    expect(retried.status).toBe(201);
    expect(await countAnaTickets()).toBe(1);
  });
});
