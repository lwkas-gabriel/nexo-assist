import { randomUUID } from "node:crypto";
import type { TicketDto } from "@nexo/shared/contracts";
import { describe, expect, it } from "vitest";
import { createHttpTicketGateway } from "./http-ticket-gateway.ts";

const BASE_URL = "http://tickets.test";
const TOKEN = randomUUID();
const ANA = "emp-ana-souza";

const ticket: TicketDto = {
  number: "INC-20500",
  ownerId: ANA,
  type: "incident",
  category: "network_vpn",
  priority: "high",
  status: "new",
  affected: "just_me",
  title: "VPN não conecta — erro 809",
  description: "Desde ontem a VPN não conecta e mostra o erro 809.",
  createdAt: "2026-10-29T12:00:00.000Z",
  updatedAt: "2026-10-29T12:00:00.000Z",
  lastStaffUpdateAt: null,
  resolvedAt: null,
  updates: [],
};

const draft = {
  title: ticket.title,
  description: ticket.description,
  type: ticket.type,
  category: ticket.category,
  priority: ticket.priority,
  affected: ticket.affected,
};

type Step = Response | "network-error" | "hang";
type RecordedCall = { url: string; method: string; headers: Record<string, string> };

/** fetch falso: devolve as respostas na ordem, registra as chamadas e respeita o timeout. */
function createFakeFetch(steps: Step[]) {
  const calls: RecordedCall[] = [];
  const fakeFetch = (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
    });
    const step = steps.shift() ?? "network-error";
    if (step === "network-error") return Promise.reject(new TypeError("fetch failed"));
    if (step === "hang") {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("timeout")));
      });
    }
    return Promise.resolve(step);
  };
  return { fakeFetch, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const unavailable = () => json({ error: { code: "TICKETS_UNAVAILABLE", message: "fora" } }, 503);

function createGateway(steps: Step[]) {
  const { fakeFetch, calls } = createFakeFetch(steps);
  const sleeps: number[] = [];
  const gateway = createHttpTicketGateway({
    baseUrl: BASE_URL,
    serviceToken: TOKEN,
    fetch: fakeFetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0,
    timeoutMs: 20,
  });
  return { gateway, calls, sleeps };
}

describe("createHttpTicketGateway", () => {
  it("envia o token de serviço e valida a resposta pelo contrato", async () => {
    const { gateway, calls } = createGateway([json({ tickets: [ticket] })]);

    const tickets = await gateway.listTickets(ANA, "open");

    expect(tickets).toEqual([ticket]);
    expect(calls[0]?.url).toBe(`${BASE_URL}/tickets?ownerId=${ANA}&filter=open`);
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("RT05: tenta de novo quando o legado está fora e espera cada vez mais", async () => {
    const { gateway, calls, sleeps } = createGateway([
      unavailable(),
      "network-error",
      json(ticket),
    ]);

    const result = await gateway.getTicket(ANA, "INC-20500");

    expect(result.number).toBe("INC-20500");
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([200, 400]);
  });

  it("RT05: tenta de novo quando a resposta demora demais (timeout)", async () => {
    const { gateway, calls } = createGateway(["hang", json(ticket)]);

    await gateway.getTicket(ANA, "INC-20500");

    expect(calls).toHaveLength(2);
  });

  it("R01: repete a escrita sempre com a mesma chave de idempotência", async () => {
    const { gateway, calls } = createGateway([unavailable(), json(ticket, 201)]);
    const key = randomUUID();

    await gateway.createTicket(ANA, draft, key);

    expect(calls.map((call) => call.headers["Idempotency-Key"])).toEqual([key, key]);
  });

  it("depois de 3 tentativas, desiste com erro tipado (o agent explica com honestidade)", async () => {
    const { gateway, calls } = createGateway([unavailable(), unavailable(), unavailable()]);

    await expect(gateway.getTicket(ANA, "INC-20500")).rejects.toMatchObject({
      code: "TICKETS_UNAVAILABLE",
    });
    expect(calls).toHaveLength(3);
  });

  it("não tenta de novo um 404: o chamado não existe (ou não é do funcionário)", async () => {
    const { gateway, calls } = createGateway([
      json({ error: { code: "NOT_FOUND", message: "Chamado INC-1 não encontrado." } }, 404),
    ]);

    await expect(gateway.getTicket(ANA, "INC-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Chamado INC-1 não encontrado.",
    });
    expect(calls).toHaveLength(1);
  });

  it("repassa o 409 como conflito de negócio", async () => {
    const { gateway } = createGateway([
      json({ error: { code: "CONFLICT", message: "Resolvido há mais de 7 dias." } }, 409),
    ]);

    await expect(gateway.reopenTicket(ANA, "INC-19877", randomUUID())).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("trata resposta fora do contrato como erro, sem repassar dados inválidos", async () => {
    const { gateway } = createGateway([json({ number: 123 })]);

    await expect(gateway.getTicket(ANA, "INC-20500")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
