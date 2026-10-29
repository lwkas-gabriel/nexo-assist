import { DEMO_USERS } from "@nexo/shared/demo";
import { checkReopen, getSlaStatus, type SlaTrackedTicket } from "@nexo/shared/domain";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../db/database.ts";
import { buildDemoTickets, type DemoTicket } from "./demo-tickets.ts";
import { seedDatabase } from "./seed-database.ts";

// Uma segunda e um sábado: os cenários precisam valer em qualquer dia da semana.
const SEED_DAYS = [new Date("2026-10-26T13:00:00Z"), new Date("2026-10-31T13:00:00Z")];

function slaInputOf(ticket: DemoTicket): SlaTrackedTicket {
  return {
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    ...(ticket.lastStaffUpdateAt ? { lastStaffUpdateAt: ticket.lastStaffUpdateAt } : {}),
  };
}

describe.each(SEED_DAYS)("dados de demonstração gerados em %s", (now) => {
  const demoTickets = buildDemoTickets(now);
  const byNumber = (number: string) => {
    const ticket = demoTickets.find((candidate) => candidate.number === number);
    if (!ticket) throw new Error(`${number} não está nos dados de demonstração`);
    return ticket;
  };

  it("todo chamado pertence a um funcionário de demonstração", () => {
    const employeeIds: string[] = DEMO_USERS.filter((user) => user.role === "employee").map(
      (user) => user.id,
    );

    for (const ticket of demoTickets) {
      expect(employeeIds).toContain(ticket.ownerId);
    }
  });

  it("os números são únicos", () => {
    const numbers = demoTickets.map((ticket) => ticket.number);

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("tela 3: INC-20311 está vencido (RN12)", () => {
    const sla = getSlaStatus(slaInputOf(byNumber("INC-20311")), now);

    expect(sla).toMatchObject({ isTracked: true, isOverdue: true });
  });

  it("INC-20298 está dentro do prazo", () => {
    const sla = getSlaStatus(slaInputOf(byNumber("INC-20298")), now);

    expect(sla).toMatchObject({ isTracked: true, isOverdue: false });
  });

  it("RN06: INC-20150 ainda pode ser reaberto; INC-19877 não", () => {
    const recent = byNumber("INC-20150");
    const old = byNumber("INC-19877");

    expect(
      checkReopen({ status: recent.status, resolvedAt: recent.resolvedAt ?? undefined }, now),
    ).toEqual({ canReopen: true });
    expect(
      checkReopen({ status: old.status, resolvedAt: old.resolvedAt ?? undefined }, now).canReopen,
    ).toBe(false);
  });
});

describe("seedDatabase", () => {
  it("grava os chamados e pode rodar de novo sem duplicar", async () => {
    const { db } = await openDatabase(":memory:");
    const now = new Date("2026-10-26T13:00:00Z");

    await seedDatabase(db, now);
    await seedDatabase(db, now);

    const stored = await db.query.tickets.findMany();
    expect(stored).toHaveLength(buildDemoTickets(now).length);
  });
});
