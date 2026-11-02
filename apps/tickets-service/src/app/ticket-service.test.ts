import type { TicketDraft } from "@nexo/shared/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../db/database.ts";
import { tickets } from "../db/schema.ts";
import { createTicketService } from "./ticket-service.ts";

const ANA = "emp-ana-souza";
const BRUNO = "emp-bruno-tavares";

const vpnDraft: TicketDraft = {
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  type: "incident",
  category: "network_vpn",
  priority: "high",
  affected: "just_me",
};

/** Serviço com banco em memória e um relógio que o teste controla. */
async function setup(start = new Date("2026-10-29T12:00:00Z")) {
  let current = start;
  const clock = { now: () => current };
  const { db } = await openDatabase(":memory:");
  const service = createTicketService({ db, clock });
  return {
    service,
    /** Resolver é papel do analista no sistema legado; aqui o teste simula direto no banco. */
    markResolved: (number: string) => resolveInDatabase(db, number, current),
    advanceDays: (days: number) => (current = new Date(current.getTime() + days * 86_400_000)),
  };
}

describe("criar chamado", () => {
  it("gera número sequencial pelo tipo e começa como novo", async () => {
    const { service } = await setup();

    const first = await service.create(ANA, vpnDraft);
    const second = await service.create(ANA, vpnDraft);
    const request = await service.create(ANA, { ...vpnDraft, type: "request" });

    expect([first.number, second.number, request.number]).toEqual([
      "INC-20500",
      "INC-20501",
      "REQ-10500",
    ]);
    expect(first).toMatchObject({ status: "new", ownerId: ANA, lastStaffUpdateAt: null });
  });
});

describe("privacidade (RN09)", () => {
  it("RN09: um funcionário não vê o chamado de outro (responde como inexistente)", async () => {
    const { service } = await setup();
    const anaTicket = await service.create(ANA, vpnDraft);

    await expect(service.get(BRUNO, anaTicket.number)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("RN09: a lista traz só os chamados do próprio funcionário", async () => {
    const { service } = await setup();
    await service.create(ANA, vpnDraft);
    await service.create(BRUNO, vpnDraft);

    const anaTickets = await service.list(ANA, "all");

    expect(anaTickets.map((ticket) => ticket.ownerId)).toEqual([ANA]);
  });

  it("RN09: um funcionário não atualiza, reabre nem transfere o chamado de outro", async () => {
    const { service } = await setup();
    const { number } = await service.create(ANA, vpnDraft);

    await expect(service.addUpdate(BRUNO, number, "employee", "oi")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.reopen(BRUNO, number)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.transfer(BRUNO, number, "resumo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("atualizar chamado", () => {
  it("A17: só a atualização da equipe de TI conta para o prazo", async () => {
    const { service, advanceDays } = await setup();
    const { number } = await service.create(ANA, vpnDraft);

    advanceDays(1);
    const afterEmployee = await service.addUpdate(ANA, number, "employee", "Ainda sem VPN.");
    advanceDays(1);
    const afterStaff = await service.addUpdate(ANA, number, "staff", "Reinstalei o cliente.");

    expect(afterEmployee.lastStaffUpdateAt).toBeNull();
    expect(afterStaff.lastStaffUpdateAt).toBe(afterStaff.updatedAt);
    expect(afterStaff.updates.map((update) => update.author)).toEqual([
      "system",
      "employee",
      "staff",
    ]);
  });

  it("não complementa chamado fechado: é preciso reabrir ou abrir outro", async () => {
    const { service, markResolved } = await setup();
    const { number } = await service.create(ANA, vpnDraft);
    await markResolved(number);

    await expect(service.addUpdate(ANA, number, "employee", "voltou")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("listar", () => {
  it("o filtro 'open' deixa de fora os chamados fechados", async () => {
    const { service, markResolved } = await setup();
    const open = await service.create(ANA, vpnDraft);
    const closed = await service.create(ANA, vpnDraft);
    await markResolved(closed.number);

    const openTickets = await service.list(ANA, "open");

    expect(openTickets.map((ticket) => ticket.number)).toEqual([open.number]);
  });
});

describe("reabrir (RN06)", () => {
  it("RN06: reabre chamado resolvido há até 7 dias", async () => {
    const { service, markResolved, advanceDays } = await setup();
    const { number } = await service.create(ANA, vpnDraft);
    await markResolved(number);
    advanceDays(4);

    const reopened = await service.reopen(ANA, number);

    expect(reopened).toMatchObject({ status: "reopened", resolvedAt: null });
  });

  it("RN06: recusa reabrir depois de 7 dias", async () => {
    const { service, markResolved, advanceDays } = await setup();
    const { number } = await service.create(ANA, vpnDraft);
    await markResolved(number);
    advanceDays(8);

    await expect(service.reopen(ANA, number)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("transferir (RN07)", () => {
  it("RN07: marca como aguardando analista e registra o resumo", async () => {
    const { service } = await setup();
    const { number } = await service.create(ANA, vpnDraft);

    const transferred = await service.transfer(ANA, number, "VPN parada, reunião às 14h.");

    expect(transferred.status).toBe("waiting_analyst");
    expect(transferred.updates.at(-1)?.message).toContain("VPN parada, reunião às 14h.");
  });
});

describe("assumir (R31)", () => {
  it("o chamado fica em atendimento, e o registro da equipe conta para o prazo (A17)", async () => {
    const { service, advanceDays } = await setup();
    const { number } = await service.create(ANA, vpnDraft);
    await service.transfer(ANA, number, "VPN parada.");
    advanceDays(1);

    const assumed = await service.assume(ANA, number, "Rafael Lima");

    expect(assumed.status).toBe("in_service");
    expect(assumed.updates.at(-1)).toMatchObject({
      author: "staff",
      message: "Atendimento assumido por Rafael Lima.",
    });
    expect(assumed.lastStaffUpdateAt).toBe(assumed.updates.at(-1)?.createdAt);
  });

  it("RN09: não assume o chamado de outro funcionário", async () => {
    const { service } = await setup();
    const { number } = await service.create(ANA, vpnDraft);

    await expect(service.assume("emp-bruno-tavares", number, "Rafael Lima")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

async function resolveInDatabase(db: Database, number: string, at: Date) {
  await db
    .update(tickets)
    .set({ status: "resolved", resolvedAt: at })
    .where(eq(tickets.number, number));
}
