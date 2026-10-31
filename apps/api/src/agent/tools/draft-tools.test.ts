import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { createFakeTicketGateway, createTestAgentServices } from "../../test-support.ts";
import { createAgentRequestContext } from "../agent-context.ts";
import { createDraftTools } from "./draft-tools.ts";
import { createTicketTools } from "./ticket-tools.ts";

const ANA = "emp-ana-souza";
const BRUNO = "emp-bruno-tavares";

const vpnDraft = {
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook não conecta na VPN e mostra o erro 809.",
  type: "incident",
  category: "network_vpn",
  affected: "just_me",
  urgency: "deadline_today",
  duplicatesReviewed: false,
} as const;

/** Tools como o agent as chama, com turnos que começam no relógio do teste. */
async function setup() {
  let now = new Date("2026-10-27T12:43:00Z");
  const clock = { now: () => now };
  const fake = createFakeTicketGateway();
  const { draftService, handoffService, conversationStore, conversationId } =
    await createTestAgentServices(fake.ticketGateway, clock);
  const tools = createDraftTools({ draftService, handoffService, conversationStore });

  /** Um turno novo: começa quando chega a mensagem do funcionário. */
  const turn = (overrides: { employeeId?: string; conversationId?: string } = {}) =>
    createAgentRequestContext({
      employeeId: ANA,
      conversationId,
      startedAt: now,
      ...overrides,
    });
  type DraftInput = Parameters<NonNullable<typeof tools.propose_ticket_draft.execute>>[0];
  const propose = (requestContext: RequestContext, draft: DraftInput = vpnDraft) =>
    tools.propose_ticket_draft.execute?.(draft, { requestContext });
  const confirm = (draftId: string, requestContext: RequestContext) =>
    tools.confirm_draft.execute?.({ draftId }, { requestContext });

  /** A resposta do agent mostrou o rascunho e, um minuto depois, chega a mensagem seguinte. */
  const replyShowsThenNextMessage = async (draftId: string) => {
    await draftService.markShownInReply(conversationId, `Montei o rascunho ${draftId}.`);
    now = new Date(now.getTime() + 60_000);
  };

  return {
    fake,
    draftService,
    handoffService,
    conversationStore,
    conversationId,
    tools,
    ticketTools: createTicketTools({ ticketGateway: fake.ticketGateway, clock }),
    turn,
    propose,
    confirm,
    replyShowsThenNextMessage,
  };
}

async function proposedDraftId(result: unknown): Promise<string> {
  const awaited = (await result) as { ok: boolean; draft?: { draftId: string } };
  if (!awaited.ok || !awaited.draft) throw new Error("Rascunho não proposto");
  return awaited.draft.draftId;
}

describe("tools de rascunho (RN04, R04)", () => {
  it("propor não cria chamado: devolve o rascunho com a prioridade da matriz", async () => {
    const { propose, turn, fake } = await setup();

    const result = await propose(turn());

    expect(result).toMatchObject({
      ok: true,
      draft: { draftId: "D-1", ticket: { priority: "Alta" } },
    });
    expect(fake.tickets).toHaveLength(0);
  });

  it("R04: recusa confirmar no mesmo turno em que propôs", async () => {
    const { propose, confirm, turn, fake } = await setup();
    const sameTurn = turn();
    const draftId = await proposedDraftId(propose(sameTurn));

    const result = await confirm(draftId, sameTurn);

    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(fake.tickets).toHaveLength(0);
  });

  it("R04: confirma na mensagem seguinte do funcionário", async () => {
    const { propose, confirm, turn, replyShowsThenNextMessage, fake } = await setup();
    const draftId = await proposedDraftId(propose(turn()));
    await replyShowsThenNextMessage(draftId);

    const result = await confirm(draftId, turn());

    expect(result).toMatchObject({ ok: true, ticket: { number: fake.tickets[0]?.number } });
  });

  it("R04: não confirma rascunho de outra conversa", async () => {
    const { propose, confirm, turn, replyShowsThenNextMessage, fake } = await setup();
    const draftId = await proposedDraftId(propose(turn()));
    await replyShowsThenNextMessage(draftId);

    const result = await confirm(draftId, turn({ conversationId: "outra-conversa" }));

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(fake.tickets).toHaveLength(0);
  });

  it("RN09: outro funcionário não confirma o rascunho (responde como inexistente)", async () => {
    const { propose, confirm, turn, replyShowsThenNextMessage } = await setup();
    const draftId = await proposedDraftId(propose(turn()));
    await replyShowsThenNextMessage(draftId);

    const result = await confirm(draftId, turn({ employeeId: BRUNO }));

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("não confirma rascunho cancelado", async () => {
    const {
      propose,
      confirm,
      turn,
      replyShowsThenNextMessage,
      draftService,
      conversationId,
      fake,
    } = await setup();
    const draftId = await proposedDraftId(propose(turn()));
    await draftService.cancel({ employeeId: ANA, draftNumber: 1, conversationId });
    await replyShowsThenNextMessage(draftId);

    const result = await confirm(draftId, turn());

    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(fake.tickets).toHaveLength(0);
  });

  it("R43: não confirma num turno que leu dados de chamados (texto que pode trazer instruções)", async () => {
    const { propose, confirm, turn, replyShowsThenNextMessage, ticketTools, fake } = await setup();
    const draftId = await proposedDraftId(propose(turn()));
    await replyShowsThenNextMessage(draftId);
    const turnThatReadTickets = turn();
    await ticketTools.get_ticket.execute?.(
      { number: "INC-20311" },
      { requestContext: turnThatReadTickets },
    );

    const result = await confirm(draftId, turnThatReadTickets);

    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(fake.tickets).toHaveLength(0);
  });

  it("complemento só com espaços é recusado pela tool, sem gravar rascunho", async () => {
    const { tools, turn } = await setup();

    const call = tools.propose_ticket_update.execute?.(
      { number: "INC-20311", message: "   " },
      { requestContext: turn() },
    );

    expect(await call).toMatchObject({ error: true });
  });

  it("id de rascunho que não é um número não consulta nada", async () => {
    const { confirm, turn } = await setup();

    expect(await confirm("o último", turn())).toEqual({ ok: false, reason: "not_found" });
  });

  it("falha fechada: sem turno no contexto, não propõe nada", async () => {
    const { propose, fake } = await setup();

    await expect(propose(new RequestContext())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fake.tickets).toHaveLength(0);
  });

  it("opções rápidas só levam a pergunta até a tela", async () => {
    const { tools, turn } = await setup();

    const result = await tools.ask_with_options.execute?.(
      { question: "Quem está sendo afetado?", options: ["Só eu", "Minha equipe"] },
      { requestContext: turn() },
    );

    expect(result).toEqual({
      ok: true,
      question: "Quem está sendo afetado?",
      options: ["Só eu", "Minha equipe"],
    });
  });

  it("A04: confirmar pelo chat um chamado crítico transfere a conversa para o N2", async () => {
    const { propose, confirm, turn, replyShowsThenNextMessage, conversationStore, conversationId } =
      await setup();
    // A equipe toda parada: Crítica pela matriz (RN11).
    const draftId = await proposedDraftId(
      propose(turn(), { ...vpnDraft, affected: "my_team", urgency: "blocked" }),
    );
    await replyShowsThenNextMessage(draftId);

    const result = await confirm(draftId, turn());

    expect(result).toMatchObject({
      ok: true,
      handoff: { supportLevel: "N2", reason: "caso crítico" },
      escalationFailed: false,
    });
    expect(await conversationStore.findById(conversationId)).toMatchObject({
      mode: "waiting_analyst",
    });
  });

  it("RN08: depois da transferência, no mesmo turno, as tools não propõem nem confirmam", async () => {
    const {
      propose,
      confirm,
      turn,
      replyShowsThenNextMessage,
      handoffService,
      conversationId,
      fake,
    } = await setup();
    const draftId = await proposedDraftId(propose(turn()));
    await replyShowsThenNextMessage(draftId);
    const sameTurn = turn();
    await handoffService.handoff({
      employeeId: ANA,
      conversationId,
      reason: "employee_request",
      summary: { problem: "VPN", attempted: "nada ainda" },
    });

    expect(await confirm(draftId, sameTurn)).toMatchObject({ ok: false, reason: "refused" });
    expect(await propose(sameTurn)).toMatchObject({ ok: false, reason: "refused" });
    expect(fake.tickets).toHaveLength(0);
  });
});
