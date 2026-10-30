import type { TicketDto } from "@nexo/shared/contracts";
import { DEMO_USERS } from "@nexo/shared/demo";
import { AppError } from "@nexo/shared/errors";
import { describe, expect, it } from "vitest";
import { createConversationStore } from "../db/conversation-store.ts";
import { openDatabase } from "../db/database.ts";
import { createDraftStore } from "../db/draft-store.ts";
import { createUserStore } from "../db/user-store.ts";
import type { TicketGateway } from "../ports/ticket-gateway.ts";
import { createFakeTicketGateway, sampleTicket } from "../test-support.ts";
import { createDraftService } from "./draft-service.ts";

const ANA = "emp-ana-souza";
const BRUNO = "emp-bruno-tavares";
const BUTTON = { via: "button" } as const;

/** O que o agent extrairia da conversa da tela 2 do protótipo (VPN e reunião às 14h). */
const vpnInput = {
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  type: "incident",
  category: "network_vpn",
  affected: "just_me",
  urgency: "deadline_today",
};

type SetupOptions = {
  existingTickets?: TicketDto[];
  /** Troca peças do sistema de chamados falso (ex.: uma escrita que falha). */
  gateway?: (fake: TicketGateway) => TicketGateway;
};

async function setup({ existingTickets = [sampleTicket()], gateway }: SetupOptions = {}) {
  // Terça, 27/10 às 9:43 em Brasília (como na tela 2).
  let now = new Date("2026-10-27T12:43:00Z");
  const clock = { now: () => now };
  const { db } = await openDatabase(":memory:");
  await createUserStore(db).upsertAll(DEMO_USERS);
  const conversation = await createConversationStore(db).create(ANA, now);
  const fake = createFakeTicketGateway(existingTickets);
  const service = createDraftService({
    draftStore: createDraftStore(db),
    ticketGateway: gateway ? gateway(fake.ticketGateway) : fake.ticketGateway,
    clock,
  });

  /** O rascunho da Ana nesta conversa. */
  const ref = (draftNumber: number) => ({
    employeeId: ANA,
    draftNumber,
    conversationId: conversation.id,
  });
  const proposeVpn = async (
    input: Record<string, unknown> = vpnInput,
    duplicatesReviewed = false,
  ) =>
    service.proposeNewTicket({
      employeeId: ANA,
      conversationId: conversation.id,
      input,
      duplicatesReviewed,
    });
  /** Propõe e devolve o número do rascunho. */
  const proposedVpn = async () => {
    const result = await proposeVpn();
    if (!result.ok) throw new Error(`Rascunho não proposto: ${result.reason}`);
    return result.draft.number;
  };
  const advanceMinutes = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));
  /** A resposta do agent que mostra o rascunho terminou (R04). */
  const showInReply = (draftNumber: number) =>
    service.markShownInReply(conversation.id, `Montei o rascunho D-${draftNumber}. Confirma?`);

  return {
    service,
    fake,
    conversation,
    ref,
    proposeVpn,
    proposedVpn,
    showInReply,
    advanceMinutes,
    now: () => now,
  };
}

describe("propor chamado novo (RF15)", () => {
  it("RN03: diz exatamente o que falta, com os nomes que o agent usa para perguntar", async () => {
    const { proposeVpn } = await setup();

    const result = await proposeVpn({ title: vpnInput.title, type: "incident" });

    expect(result).toEqual({
      ok: false,
      reason: "incomplete",
      missing: [
        "descrição",
        "categoria",
        "quem está sendo afetado",
        "urgência (se há trabalho parado, compromisso hoje ou alternativa)",
      ],
    });
  });

  it("RN11: a prioridade sai da matriz, não do agent (tela 2: só eu + reunião hoje → Alta)", async () => {
    const { proposeVpn } = await setup({ existingTickets: [] });

    const result = await proposeVpn({ ...vpnInput, priority: "critical" });

    expect(result).toMatchObject({
      ok: true,
      draft: {
        draftId: "D-1",
        status: "pending",
        ticket: {
          priority: "Alta",
          priorityReason: "RN11: somente você + compromisso hoje → Alta",
          slaRule: "4 horas úteis",
          firstResponseBy: "27/10, 13:43",
          category: "Rede e VPN",
          affected: "Somente você",
        },
      },
    });
  });

  it("RN05: aponta um chamado aberto parecido antes de criar outro", async () => {
    const openVpn = sampleTicket({
      number: "INC-20400",
      category: "network_vpn",
      title: "VPN não conecta",
      description: "A VPN não conecta no notebook.",
    });
    const { proposeVpn } = await setup({ existingTickets: [openVpn] });

    const result = await proposeVpn();

    expect(result).toEqual({
      ok: false,
      reason: "possible_duplicate",
      candidates: [
        {
          number: "INC-20400",
          title: "VPN não conecta",
          status: "Aguardando analista",
          action: "complementar",
        },
      ],
    });
  });

  it("RN05: depois que o funcionário diz que é outro problema, o rascunho é criado", async () => {
    const openVpn = sampleTicket({
      number: "INC-20400",
      category: "network_vpn",
      title: "VPN não conecta",
    });
    const { proposeVpn } = await setup({ existingTickets: [openVpn] });

    const result = await proposeVpn(vpnInput, true);

    expect(result.ok).toBe(true);
  });

  it("propor de novo descarta o rascunho pendente anterior da conversa", async () => {
    const { proposedVpn, proposeVpn, service, ref } = await setup({ existingTickets: [] });
    const first = await proposedVpn();

    await proposeVpn({ ...vpnInput, title: "VPN cai e não volta" });

    expect(await service.view(ref(first))).toMatchObject({ status: "cancelled" });
  });
});

describe("confirmar (RN04)", () => {
  it("RN04: só a confirmação cria o chamado, com a chave de idempotência do rascunho (R01)", async () => {
    const { proposedVpn, service, fake, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();
    expect(fake.tickets).toHaveLength(0);

    const { ticket, draft } = await service.confirm({ ...ref(number), source: BUTTON });

    expect(ticket).toMatchObject({ ownerId: ANA, priority: "high", category: "network_vpn" });
    expect(draft).toMatchObject({ status: "confirmed", ticketNumber: ticket.number });
    expect(fake.tickets).toHaveLength(1);
  });

  it("confirmar duas vezes não cria dois chamados", async () => {
    const { proposedVpn, service, fake, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();
    await service.confirm({ ...ref(number), source: BUTTON });

    await expect(service.confirm({ ...ref(number), source: BUTTON })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(fake.tickets).toHaveLength(1);
  });

  it("R01: duas confirmações ao mesmo tempo escrevem uma vez só no sistema de chamados", async () => {
    let createCalls = 0;
    const { proposedVpn, service, fake, ref } = await setup({
      existingTickets: [],
      gateway: (gateway) => ({
        ...gateway,
        createTicket: async (...args) => {
          createCalls += 1;
          // O sistema de chamados demora: a segunda confirmação chega no meio da primeira.
          await new Promise((resolve) => setTimeout(resolve, 20));
          return gateway.createTicket(...args);
        },
      }),
    });
    const number = await proposedVpn();

    const results = await Promise.allSettled([
      service.confirm({ ...ref(number), source: BUTTON }),
      service.confirm({ ...ref(number), source: BUTTON }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(createCalls).toBe(1);
    expect(fake.tickets).toHaveLength(1);
  });

  it("R01: se a escrita falha, o rascunho congela: não edita nem cancela, só confirma de novo", async () => {
    let failNext = true;
    const { proposedVpn, service, fake, ref } = await setup({
      existingTickets: [],
      gateway: (gateway) => ({
        ...gateway,
        // Grava e perde a resposta: o caso do R01 (timeout depois de criar).
        createTicket: async (...args) => {
          const ticket = await gateway.createTicket(...args);
          if (!failNext) return ticket;
          failNext = false;
          throw new AppError("TICKETS_UNAVAILABLE", "timeout");
        },
      }),
    });
    const number = await proposedVpn();
    await expect(service.confirm({ ...ref(number), source: BUTTON })).rejects.toMatchObject({
      code: "TICKETS_UNAVAILABLE",
    });

    const edit = service.edit({ ...ref(number), changes: { affected: "my_team" } });
    const cancel = service.cancel(ref(number));
    await expect(edit).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancel).rejects.toMatchObject({ code: "CONFLICT" });

    const retried = await service.confirm({ ...ref(number), source: BUTTON });
    expect(retried.draft).toMatchObject({ status: "confirmed", ticket: { priority: "Alta" } });
    expect(fake.tickets.map((ticket) => ticket.number)).toEqual([retried.ticket.number]);
  });

  it("R04: pelo chat, recusa confirmar um rascunho que a resposta do agent ainda não mostrou", async () => {
    const { proposedVpn, service, ref, advanceMinutes, now } = await setup({ existingTickets: [] });
    const number = await proposedVpn();
    advanceMinutes(1);

    // A resposta que propôs falhou (ex.: cota do modelo) e nunca mostrou o D-1.
    const call = service.confirm({ ...ref(number), source: { via: "chat", turnStartedAt: now() } });

    await expect(call).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("R04: pelo chat, recusa confirmar no mesmo turno em que o rascunho foi mostrado", async () => {
    const { proposedVpn, service, ref, showInReply, now } = await setup({ existingTickets: [] });
    const turnStartedAt = now();
    const number = await proposedVpn();
    await showInReply(number);

    const call = service.confirm({ ...ref(number), source: { via: "chat", turnStartedAt } });

    await expect(call).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("R04: pelo chat, confirma o rascunho mostrado numa resposta anterior", async () => {
    const { proposedVpn, service, ref, showInReply, advanceMinutes, now } = await setup({
      existingTickets: [],
    });
    const number = await proposedVpn();
    await showInReply(number);
    advanceMinutes(1);

    const result = await service.confirm({
      ...ref(number),
      source: { via: "chat", turnStartedAt: now() },
    });

    expect(result.draft.status).toBe("confirmed");
  });

  it("R04: pelo chat, recusa se o funcionário editou o card depois de a mensagem chegar", async () => {
    const { proposedVpn, service, ref, showInReply, advanceMinutes, now } = await setup({
      existingTickets: [],
    });
    const number = await proposedVpn();
    await showInReply(number);
    advanceMinutes(1);
    const turnStartedAt = now();
    advanceMinutes(1);
    await service.edit({ ...ref(number), changes: { affected: "my_team" } });

    const call = service.confirm({ ...ref(number), source: { via: "chat", turnStartedAt } });

    await expect(call).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("RN09: outro funcionário não confirma nem vê o rascunho (responde como inexistente)", async () => {
    const { proposedVpn, service, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();
    const asBruno = { ...ref(number), employeeId: BRUNO };

    await expect(service.confirm({ ...asBruno, source: BUTTON })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.view(asBruno)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("não confirma rascunho de outra conversa", async () => {
    const { proposedVpn, service, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();

    const call = service.confirm({
      ...ref(number),
      conversationId: "outra-conversa",
      source: BUTTON,
    });

    await expect(call).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("R04: a resposta do agent só marca como visto rascunho da própria conversa", async () => {
    const { proposedVpn, service, ref, advanceMinutes, now } = await setup({ existingTickets: [] });
    const number = await proposedVpn();
    await service.markShownInReply("outra-conversa", `Rascunho D-${number}`);
    advanceMinutes(1);

    const call = service.confirm({ ...ref(number), source: { via: "chat", turnStartedAt: now() } });

    await expect(call).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("complementar e reabrir (RF14, RN05, RN06)", () => {
  async function proposeUpdate(
    context: Awaited<ReturnType<typeof setup>>,
    message = "Agora o notebook também trava ao abrir o Teams.",
  ) {
    return context.service.proposeTicketUpdate({
      employeeId: ANA,
      conversationId: context.conversation.id,
      ticketNumber: "inc 20311",
      message,
    });
  }

  it("RF14: chamado aberto recebe o complemento do funcionário ao confirmar", async () => {
    const context = await setup();

    const proposal = await proposeUpdate(context);
    if (!proposal.ok) throw new Error(proposal.reason);
    await context.service.confirm({ ...context.ref(proposal.draft.number), source: BUTTON });

    expect(proposal.draft).toMatchObject({ kind: "update", ticketNumber: "INC-20311" });
    expect(context.fake.tickets[0]?.updates.at(-1)).toMatchObject({
      author: "employee",
      message: "Agora o notebook também trava ao abrir o Teams.",
    });
  });

  it("complemento vazio pede o texto e não descarta o rascunho pendente", async () => {
    const context = await setup();
    const pending = await context.proposeVpn(vpnInput, true);
    if (!pending.ok) throw new Error(pending.reason);

    const proposal = await proposeUpdate(context, "   ");

    expect(proposal).toMatchObject({ ok: false, reason: "incomplete" });
    expect(await context.service.view(context.ref(pending.draft.number))).toMatchObject({
      status: "pending",
    });
  });

  it("RN06: chamado resolvido há até 7 dias é reaberto com o complemento", async () => {
    const resolved = sampleTicket({ status: "resolved", resolvedAt: "2026-10-23T17:00:00.000Z" });
    const context = await setup({ existingTickets: [resolved] });

    const proposal = await proposeUpdate(context, "A lentidão voltou.");
    if (!proposal.ok) throw new Error(proposal.reason);
    await context.service.confirm({ ...context.ref(proposal.draft.number), source: BUTTON });

    expect(proposal.draft.kind).toBe("reopen");
    expect(context.fake.tickets[0]?.status).toBe("reopened");
  });

  it("RN06: resolvido há mais de 7 dias não reabre (abre-se um chamado novo)", async () => {
    const old = sampleTicket({ status: "resolved", resolvedAt: "2026-09-01T17:00:00.000Z" });
    const context = await setup({ existingTickets: [old] });

    const proposal = await proposeUpdate(context, "A lentidão voltou.");

    expect(proposal).toEqual({ ok: false, reason: "cannot_reopen", why: "window_expired" });
  });

  it("chamado cancelado não reabre, e o motivo não é o prazo de 7 dias", async () => {
    const cancelled = sampleTicket({ status: "cancelled" });
    const context = await setup({ existingTickets: [cancelled] });

    const proposal = await proposeUpdate(context, "A lentidão voltou.");

    expect(proposal).toEqual({ ok: false, reason: "cannot_reopen", why: "cancelled" });
  });
});

describe("editar e cancelar (R16)", () => {
  it("R16: editar quem é afetado recalcula a prioridade pela matriz", async () => {
    const { proposedVpn, service, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();

    const edited = await service.edit({ ...ref(number), changes: { affected: "my_team" } });

    expect(edited).toMatchObject({ ticket: { priority: "Crítica", affected: "Sua equipe" } });
  });

  it("recusa edição que deixaria o rascunho inválido", async () => {
    const { proposedVpn, service, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();

    const call = service.edit({ ...ref(number), changes: { category: "impressoras" } });

    await expect(call).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("cancelar descarta o rascunho, e ele não pode mais ser confirmado", async () => {
    const { proposedVpn, service, fake, ref } = await setup({ existingTickets: [] });
    const number = await proposedVpn();

    await service.cancel(ref(number));

    await expect(service.confirm({ ...ref(number), source: BUTTON })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(fake.tickets).toHaveLength(0);
  });

  it("R35: depois de confirmado, o prazo fica o da hora da confirmação", async () => {
    const { proposedVpn, service, ref, advanceMinutes } = await setup({ existingTickets: [] });
    const number = await proposedVpn();
    advanceMinutes(20);
    await service.confirm({ ...ref(number), source: BUTTON });

    advanceMinutes(60);
    const later = await service.view(ref(number));

    expect(later).toMatchObject({ ticket: { firstResponseBy: "27/10, 14:03" } });
  });

  it("R35: o prazo mostrado acompanha a hora em que o rascunho é exibido", async () => {
    const { proposedVpn, service, ref, advanceMinutes } = await setup({ existingTickets: [] });
    const number = await proposedVpn();

    advanceMinutes(20);
    const later = await service.view(ref(number));

    expect(later).toMatchObject({ ticket: { firstResponseBy: "27/10, 14:03" } });
  });
});
