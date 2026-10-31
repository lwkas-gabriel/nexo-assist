import { AppError } from "@nexo/shared/errors";
import { describe, expect, it } from "vitest";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { createFakeTicketGateway, createTestAgentServices, sampleTicket } from "../test-support.ts";

const ANA = "emp-ana-souza";
const BRUNO = "emp-bruno-tavares";
const summary = {
  problem: "Notebook lento há 5 dias.",
  attempted: "Artigo de lentidão, sem efeito.",
};

// Terça, 27/10 às 9:00 em Brasília.
const clock = { now: () => new Date("2026-10-27T12:00:00Z") };

async function setup(gateway?: (fake: TicketGateway) => TicketGateway) {
  const fake = createFakeTicketGateway([sampleTicket()]);
  const services = await createTestAgentServices(
    gateway ? gateway(fake.ticketGateway) : fake.ticketGateway,
    clock,
  );
  const conversation = async () => services.conversationStore.findById(services.conversationId);
  const lastMessageText = async () => {
    const [last] = (
      await services.conversationStore.listRecentMessages(services.conversationId, 1)
    ).map((row) => JSON.parse(row.parts) as { text: string }[]);
    return last?.[0]?.text;
  };
  return { ...services, fake, conversation, lastMessageText };
}

describe("transferência para analista (RF16, RN07)", () => {
  it("A03 + A02: pedido do funcionário sem chamado vai para o N1, com o prazo de Alta", async () => {
    const { handoffService, conversationId, conversation, lastMessageText } = await setup();

    const handoff = await handoffService.handoff({
      employeeId: ANA,
      conversationId,
      reason: "employee_request",
      summary,
    });

    expect(handoff).toEqual({
      supportLevel: "N1",
      reason: "o funcionário pediu um analista",
      ticketNumber: null,
      ticketTransferred: false,
      responseBy: "27/10, 13:00",
    });
    expect(await conversation()).toMatchObject({ mode: "waiting_analyst", version: 2 });
    expect(await lastMessageText()).toBe(
      "Conversa transferida para o Suporte N1 (o funcionário pediu um analista). Um analista fala com você até 27/10, 13:00.",
    );
  });

  it("RN07: chamado vencido vai para o N2, e o chamado fica aguardando analista com o resumo", async () => {
    const { handoffService, conversationId, fake } = await setup();

    const handoff = await handoffService.handoff({
      employeeId: ANA,
      conversationId,
      reason: "overdue",
      summary,
      ticketNumber: "inc 20311",
    });

    // A02: o prazo segue a prioridade do chamado (média, 3 dias úteis).
    expect(handoff).toMatchObject({
      supportLevel: "N2",
      ticketNumber: "INC-20311",
      ticketTransferred: true,
      responseBy: "30/10, 09:00",
    });
    expect(fake.tickets[0]?.status).toBe("waiting_analyst");
    expect(fake.tickets[0]?.updates.at(-1)?.message).toContain("Notebook lento há 5 dias.");
  });

  it("sistema de chamados fora do ar não impede a transferência (o resultado avisa)", async () => {
    const { handoffService, conversationId, conversation } = await setup((gateway) => ({
      ...gateway,
      transferTicket: () => Promise.reject(new AppError("TICKETS_UNAVAILABLE", "instável")),
    }));

    const handoff = await handoffService.handoff({
      employeeId: ANA,
      conversationId,
      reason: "overdue",
      summary,
      ticketNumber: "INC-20311",
    });

    expect(handoff.ticketTransferred).toBe(false);
    expect(await conversation()).toMatchObject({ mode: "waiting_analyst" });
  });

  it("RN09: chamado de outra pessoa não é ligado à transferência", async () => {
    const { handoffService, conversationId, fake } = await setup();
    fake.tickets.push(sampleTicket({ number: "INC-20480", ownerId: BRUNO }));

    const handoff = await handoffService.handoff({
      employeeId: ANA,
      conversationId,
      reason: "employee_request",
      summary,
      ticketNumber: "INC-20480",
    });

    expect(handoff).toMatchObject({ ticketNumber: null, ticketTransferred: false });
    expect(fake.tickets[1]?.status).toBe("waiting_analyst");
  });

  it("não transfere de novo uma conversa que já está com os analistas", async () => {
    const { handoffService, conversationId } = await setup();
    const request = {
      employeeId: ANA,
      conversationId,
      reason: "employee_request",
      summary,
    } as const;
    await handoffService.handoff(request);

    await expect(handoffService.handoff(request)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("R06: duas transferências ao mesmo tempo, só uma passa", async () => {
    const { handoffService, conversationId } = await setup();
    const request = {
      employeeId: ANA,
      conversationId,
      reason: "employee_request",
      summary,
    } as const;

    const results = await Promise.allSettled([
      handoffService.handoff(request),
      handoffService.handoff(request),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("RN09: não transfere a conversa de outra pessoa", async () => {
    const { handoffService, conversationId } = await setup();

    const call = handoffService.handoff({
      employeeId: BRUNO,
      conversationId,
      reason: "employee_request",
      summary,
    });

    await expect(call).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("caso crítico (A04)", () => {
  const criticalTicket = {
    number: "INC-20501",
    priority: "critical",
    title: "VPN fora para toda a equipe",
    description: "Ninguém do Financeiro conecta.",
  } as const;

  it("A04: chamado crítico recém-criado leva a conversa direto para o N2", async () => {
    const { handoffService, conversationId, conversation } = await setup();

    const handoff = await handoffService.escalateIfCritical({
      employeeId: ANA,
      conversationId,
      ticket: criticalTicket,
    });

    expect(handoff).toMatchObject({ supportLevel: "N2", reason: "caso crítico" });
    expect(await conversation()).toMatchObject({ mode: "waiting_analyst" });
  });

  it("chamado que não é crítico não transfere", async () => {
    const { handoffService, conversationId, conversation } = await setup();

    const handoff = await handoffService.escalateIfCritical({
      employeeId: ANA,
      conversationId,
      ticket: { ...criticalTicket, priority: "high" },
    });

    expect(handoff).toBeNull();
    expect(await conversation()).toMatchObject({ mode: "agent" });
  });
});
