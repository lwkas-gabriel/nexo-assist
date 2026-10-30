import { DEMO_USERS } from "@nexo/shared/demo";
import { describe, expect, it } from "vitest";
import { createConversationStore } from "../db/conversation-store.ts";
import { openDatabase } from "../db/database.ts";
import { createDraftStore } from "../db/draft-store.ts";
import { createUserStore } from "../db/user-store.ts";
import { createFakeTicketGateway, sampleTicket } from "../test-support.ts";
import { createDraftService } from "./draft-service.ts";

const ANA = "emp-ana-souza";
const BRUNO = "emp-bruno-tavares";

/** O que o agent extrairia da conversa da tela 2 do protótipo (VPN e reunião às 14h). */
const vpnInput = {
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  type: "incident",
  category: "network_vpn",
  affected: "just_me",
  urgency: "deadline_today",
};

async function setup(existingTickets = [sampleTicket()]) {
  // Terça, 27/10 às 9:43 em Brasília (como na tela 2).
  let now = new Date("2026-10-27T12:43:00Z");
  const clock = { now: () => now };
  const { db } = await openDatabase(":memory:");
  await createUserStore(db).upsertAll(DEMO_USERS);
  const conversations = createConversationStore(db);
  const conversation = await conversations.create(ANA, now);
  const fake = createFakeTicketGateway(existingTickets);
  const service = createDraftService({
    draftStore: createDraftStore(db),
    ticketGateway: fake.ticketGateway,
    clock,
  });
  const proposeVpn = (input: Record<string, unknown> = vpnInput, duplicatesReviewed = false) =>
    service.proposeNewTicket({
      employeeId: ANA,
      conversationId: conversation.id,
      input,
      duplicatesReviewed,
    });

  return {
    service,
    fake,
    conversation,
    proposeVpn,
    advanceMinutes: (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000)),
    now: () => now,
  };
}

function proposedDraftNumber(
  result: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>["proposeVpn"]>>,
) {
  if (!result.ok) throw new Error(`Rascunho não proposto: ${result.reason}`);
  return result.draft.number;
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
    const { proposeVpn } = await setup([]);

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
    const { proposeVpn } = await setup([openVpn]);

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
    const { proposeVpn } = await setup([openVpn]);

    const result = await proposeVpn(vpnInput, true);

    expect(result.ok).toBe(true);
  });

  it("propor de novo descarta o rascunho pendente anterior da conversa", async () => {
    const { proposeVpn, service } = await setup([]);
    const first = proposedDraftNumber(await proposeVpn());

    await proposeVpn({ ...vpnInput, title: "VPN cai e não volta" });

    expect(await service.view({ employeeId: ANA, draftNumber: first })).toMatchObject({
      status: "cancelled",
    });
  });
});

describe("confirmar (RN04)", () => {
  it("RN04: só a confirmação cria o chamado, com a chave de idempotência do rascunho (R01)", async () => {
    const { proposeVpn, service, fake } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());
    expect(fake.tickets).toHaveLength(0);

    const { ticket, draft } = await service.confirm({ employeeId: ANA, draftNumber: number });

    expect(ticket).toMatchObject({ ownerId: ANA, priority: "high", category: "network_vpn" });
    expect(draft).toMatchObject({ status: "confirmed", ticketNumber: ticket.number });
    expect(fake.tickets).toHaveLength(1);
  });

  it("confirmar duas vezes não cria dois chamados", async () => {
    const { proposeVpn, service, fake } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());
    await service.confirm({ employeeId: ANA, draftNumber: number });

    await expect(service.confirm({ employeeId: ANA, draftNumber: number })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(fake.tickets).toHaveLength(1);
  });

  it("R04: pelo chat, recusa confirmar um rascunho que o funcionário ainda não viu", async () => {
    const { proposeVpn, service, now } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    // O turno que propôs é o mesmo que tenta confirmar: o rascunho não existia antes dele.
    const sameTurn = service.confirm({ employeeId: ANA, draftNumber: number, shownBefore: now() });

    await expect(sameTurn).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("R04: pelo chat, confirma o rascunho mostrado num turno anterior", async () => {
    const { proposeVpn, service, now, advanceMinutes } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());
    advanceMinutes(1);

    const result = await service.confirm({
      employeeId: ANA,
      draftNumber: number,
      shownBefore: now(),
    });

    expect(result.draft.status).toBe("confirmed");
  });

  it("RN09: outro funcionário não confirma nem vê o rascunho (responde como inexistente)", async () => {
    const { proposeVpn, service } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    await expect(service.confirm({ employeeId: BRUNO, draftNumber: number })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
    await expect(service.view({ employeeId: BRUNO, draftNumber: number })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("pelo chat, não confirma rascunho de outra conversa", async () => {
    const { proposeVpn, service } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    const call = service.confirm({
      employeeId: ANA,
      draftNumber: number,
      conversationId: "outra-conversa",
    });

    await expect(call).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("complementar e reabrir (RF14, RN05, RN06)", () => {
  it("RF14: chamado aberto recebe o complemento do funcionário ao confirmar", async () => {
    const { service, fake, conversation } = await setup();

    const proposal = await service.proposeTicketUpdate({
      employeeId: ANA,
      conversationId: conversation.id,
      ticketNumber: "inc 20311",
      message: "Agora o notebook também trava ao abrir o Teams.",
    });
    if (!proposal.ok) throw new Error(proposal.reason);
    await service.confirm({ employeeId: ANA, draftNumber: proposal.draft.number });

    expect(proposal.draft).toMatchObject({ kind: "update", ticketNumber: "INC-20311" });
    expect(fake.tickets[0]?.updates.at(-1)).toMatchObject({
      author: "employee",
      message: "Agora o notebook também trava ao abrir o Teams.",
    });
  });

  it("RN06: chamado resolvido há até 7 dias é reaberto com o complemento", async () => {
    const resolved = sampleTicket({ status: "resolved", resolvedAt: "2026-10-23T17:00:00.000Z" });
    const { service, fake, conversation } = await setup([resolved]);

    const proposal = await service.proposeTicketUpdate({
      employeeId: ANA,
      conversationId: conversation.id,
      ticketNumber: "INC-20311",
      message: "A lentidão voltou.",
    });
    if (!proposal.ok) throw new Error(proposal.reason);
    await service.confirm({ employeeId: ANA, draftNumber: proposal.draft.number });

    expect(proposal.draft.kind).toBe("reopen");
    expect(fake.tickets[0]?.status).toBe("reopened");
  });

  it("RN06: resolvido há mais de 7 dias não reabre (abre-se um chamado novo)", async () => {
    const old = sampleTicket({ status: "resolved", resolvedAt: "2026-09-01T17:00:00.000Z" });
    const { service, conversation } = await setup([old]);

    const proposal = await service.proposeTicketUpdate({
      employeeId: ANA,
      conversationId: conversation.id,
      ticketNumber: "INC-20311",
      message: "A lentidão voltou.",
    });

    expect(proposal).toEqual({ ok: false, reason: "cannot_reopen" });
  });
});

describe("editar e cancelar (R16)", () => {
  it("R16: editar quem é afetado recalcula a prioridade pela matriz", async () => {
    const { proposeVpn, service } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    const edited = await service.edit({
      employeeId: ANA,
      draftNumber: number,
      changes: { affected: "my_team" },
    });

    expect(edited).toMatchObject({ ticket: { priority: "Crítica", affected: "Sua equipe" } });
  });

  it("recusa edição que deixaria o rascunho inválido", async () => {
    const { proposeVpn, service } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    const call = service.edit({
      employeeId: ANA,
      draftNumber: number,
      changes: { category: "impressoras" },
    });

    await expect(call).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("cancelar descarta o rascunho, e ele não pode mais ser confirmado", async () => {
    const { proposeVpn, service, fake } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    await service.cancel({ employeeId: ANA, draftNumber: number });

    await expect(service.confirm({ employeeId: ANA, draftNumber: number })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(fake.tickets).toHaveLength(0);
  });

  it("R35: depois de confirmado, o prazo fica o da hora da confirmação", async () => {
    const { proposeVpn, service, advanceMinutes } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());
    advanceMinutes(20);
    await service.confirm({ employeeId: ANA, draftNumber: number });

    advanceMinutes(60);
    const later = await service.view({ employeeId: ANA, draftNumber: number });

    expect(later).toMatchObject({ ticket: { firstResponseBy: "27/10, 14:03" } });
  });

  it("R35: o prazo mostrado acompanha a hora em que o rascunho é exibido", async () => {
    const { proposeVpn, service, advanceMinutes } = await setup([]);
    const number = proposedDraftNumber(await proposeVpn());

    advanceMinutes(20);
    const later = await service.view({ employeeId: ANA, draftNumber: number });

    expect(later).toMatchObject({ ticket: { firstResponseBy: "27/10, 14:03" } });
  });
});
