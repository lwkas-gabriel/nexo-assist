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

/** Aberto, sem resposta da TI desde 16/10: os 3 dias úteis da prioridade média já passaram. */
const overdueTicket = sampleTicket({
  number: "INC-20290",
  status: "in_progress",
  lastStaffUpdateAt: "2026-10-16T17:20:00.000Z",
});
/** Aberto e dentro do prazo (vence às 14:20 de hoje). */
const onTimeTicket = sampleTicket({ number: "INC-20311", status: "in_progress" });

async function setup(gateway?: (fake: TicketGateway) => TicketGateway) {
  const fake = createFakeTicketGateway([overdueTicket, onTimeTicket]);
  const services = await createTestAgentServices(
    gateway ? gateway(fake.ticketGateway) : fake.ticketGateway,
    clock,
  );
  const conversation = async () => services.conversationStore.findById(services.conversationId);
  const messageTexts = async () =>
    (await services.conversationStore.listRecentMessages(services.conversationId, 10)).map(
      (row) => (JSON.parse(row.parts) as { text: string }[])[0]?.text,
    );
  const ticket = (number: string) => fake.tickets.find((candidate) => candidate.number === number);
  const handoff = (request: Partial<Parameters<typeof services.handoffService.handoff>[0]> = {}) =>
    services.handoffService.handoff({
      employeeId: ANA,
      conversationId: services.conversationId,
      reason: "employee_request",
      summary,
      ...request,
    });
  return { ...services, fake, conversation, messageTexts, ticket, handoff };
}

describe("transferência para analista (RF16, RN07)", () => {
  it("A03 + A02: pedido do funcionário sem chamado vai para o N1, com contato em 4 h úteis", async () => {
    const { handoff, conversation, messageTexts } = await setup();

    const result = await handoff();

    expect(result).toEqual({
      supportLevel: "N1",
      reason: "o funcionário pediu um analista",
      ticketNumber: null,
      ticketTransferred: false,
      responseBy: "27/10, 13:00",
    });
    expect(await conversation()).toMatchObject({ mode: "waiting_analyst", version: 2 });
    expect(await messageTexts()).toEqual([
      "Conversa transferida para o Suporte N1 (o funcionário pediu um analista). Um analista fala com você até 27/10, 13:00.",
    ]);
  });

  it("RN07: chamado vencido vai para o N2 e fica aguardando analista, com o resumo", async () => {
    const { handoff, ticket } = await setup();

    const result = await handoff({ reason: "overdue", ticketNumber: "inc 20290" });

    expect(result).toMatchObject({
      supportLevel: "N2",
      reason: "chamado com prazo vencido",
      ticketNumber: "INC-20290",
      ticketTransferred: true,
      // A02: um chamado médio vencido não espera mais 3 dias úteis.
      responseBy: "27/10, 13:00",
    });
    expect(ticket("INC-20290")?.status).toBe("waiting_analyst");
    expect(ticket("INC-20290")?.updates.at(-1)?.message).toContain("Notebook lento há 5 dias.");
  });

  it("A03: chamado vencido vai para o N2 mesmo que o agent registre o pedido do funcionário", async () => {
    const { handoff } = await setup();

    const result = await handoff({ reason: "employee_request", ticketNumber: "INC-20290" });

    expect(result.supportLevel).toBe("N2");
  });

  it("'prazo vencido' com chamado dentro do prazo fica registrado como pedido do funcionário", async () => {
    const { handoff } = await setup();

    const result = await handoff({ reason: "overdue", ticketNumber: "INC-20311" });

    expect(result).toMatchObject({ supportLevel: "N1", reason: "o funcionário pediu um analista" });
  });

  it("A02: caso crítico sem chamado ligado tem contato em 1 hora", async () => {
    const { handoff } = await setup();

    const result = await handoff({ reason: "critical" });

    expect(result).toMatchObject({ supportLevel: "N2", responseBy: "27/10, 10:00" });
  });

  it("RN09: chamado de outra pessoa não é ligado nem alterado", async () => {
    const { handoff, fake, ticket } = await setup();
    fake.tickets.push(sampleTicket({ number: "INC-20480", ownerId: BRUNO, status: "new" }));

    const result = await handoff({ ticketNumber: "INC-20480" });

    expect(result).toMatchObject({ ticketNumber: null, ticketTransferred: false });
    expect(ticket("INC-20480")).toMatchObject({ status: "new", updates: [] });
  });

  it("sistema de chamados fora na transferência: a conversa vai para o analista mesmo assim", async () => {
    const { handoff, conversation, messageTexts } = await setup((gateway) => ({
      ...gateway,
      transferTicket: () => Promise.reject(new AppError("TICKETS_UNAVAILABLE", "instável")),
    }));

    const result = await handoff({ reason: "overdue", ticketNumber: "INC-20290" });

    expect(result).toMatchObject({ ticketNumber: "INC-20290", ticketTransferred: false });
    expect(await conversation()).toMatchObject({ mode: "waiting_analyst" });
    expect(await messageTexts()).toHaveLength(1);
  });

  it("erro inesperado ao atualizar o chamado não deixa a conversa sem resumo nem aviso", async () => {
    const { handoff, handoffStore, conversationId, messageTexts } = await setup((gateway) => ({
      ...gateway,
      transferTicket: () => Promise.reject(new TypeError("falha inesperada")),
    }));

    await handoff({ ticketNumber: "INC-20311" });

    expect(await handoffStore.latestForConversation(conversationId)).toMatchObject({
      problem: "Notebook lento há 5 dias.",
      ticketTransferred: false,
    });
    expect(await messageTexts()).toHaveLength(1);
  });

  it("sistema de chamados fora na consulta: o número informado fica registrado para o analista", async () => {
    const { handoff } = await setup((gateway) => ({
      ...gateway,
      getTicket: () => Promise.reject(new AppError("TICKETS_UNAVAILABLE", "instável")),
    }));

    const result = await handoff({ ticketNumber: "inc 20311" });

    expect(result).toMatchObject({ ticketNumber: "INC-20311", ticketTransferred: false });
  });

  it("não transfere de novo uma conversa que já está com os analistas", async () => {
    const { handoff } = await setup();
    await handoff();

    await expect(handoff()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("R06: duas transferências ao mesmo tempo, só uma passa", async () => {
    const { handoff } = await setup();

    const results = await Promise.allSettled([handoff(), handoff()]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("RN09: não transfere a conversa de outra pessoa", async () => {
    const { handoff } = await setup();

    await expect(handoff({ employeeId: BRUNO })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("caso crítico (A04)", () => {
  const criticalTicket = {
    number: "INC-20311",
    priority: "critical",
    title: "VPN fora para toda a equipe",
    description: "Ninguém do Financeiro conecta.",
  } as const;
  const created = { kind: "create" } as const;

  it("A04: chamado crítico recém-criado leva a conversa direto para o N2", async () => {
    const { handoffService, conversationId, conversation } = await setup();

    const result = await handoffService.escalateNewCriticalTicket({
      employeeId: ANA,
      conversationId,
      draft: created,
      ticket: criticalTicket,
    });

    expect(result).toMatchObject({
      handoff: { supportLevel: "N2", reason: "caso crítico", responseBy: "27/10, 10:00" },
      escalationFailed: false,
    });
    expect(await conversation()).toMatchObject({ mode: "waiting_analyst" });
  });

  it("descrição longa: o resumo cabe no limite do sistema de chamados e o chamado é marcado", async () => {
    const { handoffService, conversationId } = await setup();

    const result = await handoffService.escalateNewCriticalTicket({
      employeeId: ANA,
      conversationId,
      draft: created,
      ticket: { ...criticalTicket, description: "x".repeat(2000) },
    });

    expect(result.handoff?.ticketTransferred).toBe(true);
  });

  it("chamado que não é crítico não transfere", async () => {
    const { handoffService, conversationId, conversation } = await setup();

    const result = await handoffService.escalateNewCriticalTicket({
      employeeId: ANA,
      conversationId,
      draft: created,
      ticket: { ...criticalTicket, priority: "high" },
    });

    expect(result).toEqual({ handoff: null, escalationFailed: false });
    expect(await conversation()).toMatchObject({ mode: "agent" });
  });

  it("complemento de um chamado crítico já existente não transfere", async () => {
    const { handoffService, conversationId, conversation } = await setup();

    await handoffService.escalateNewCriticalTicket({
      employeeId: ANA,
      conversationId,
      draft: { kind: "update" },
      ticket: criticalTicket,
    });

    expect(await conversation()).toMatchObject({ mode: "agent" });
  });

  it("transferência simultânea pelo agent: o chamado crítico não vira erro", async () => {
    const { handoffService, conversationId, handoff } = await setup();

    const [, escalation] = await Promise.all([
      handoff(),
      handoffService.escalateNewCriticalTicket({
        employeeId: ANA,
        conversationId,
        draft: created,
        ticket: criticalTicket,
      }),
    ]);

    expect(escalation.escalationFailed).toBe(false);
  });
});
