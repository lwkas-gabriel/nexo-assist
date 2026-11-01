import { describe, expect, it } from "vitest";
import { evaluateInvariants, evaluateTurn, type Check } from "./evaluate.ts";
import type { ToolCallObservation, TurnObservation } from "./observation.ts";
import type { TurnExpectation } from "./scenario-schema.ts";

function observation(overrides: Partial<TurnObservation> = {}): TurnObservation {
  return {
    replyText: "",
    agentText: "",
    toolCalls: [],
    decision: {
      intentLabel: "dúvida de TI",
      classifierConfidence: 0.8,
      isClassifierAvailable: true,
    },
    newDrafts: [],
    createdTickets: [],
    contentWrites: [],
    accessedOwners: [],
    handoff: undefined,
    ...overrides,
  };
}

function call(
  name: string,
  output: unknown = { ok: true },
  extra: Partial<ToolCallObservation> = {},
): ToolCallObservation {
  return { name, origin: "agent", input: undefined, output, ...extra };
}

/** Avalia um turno e devolve a verificação de uma regra (falha o teste se ela nem foi feita). */
function checkOf(expectation: TurnExpectation, turn: TurnObservation, rule: string): Check {
  const found = evaluateTurn(expectation, turn, 1).find((item) => item.rule === rule);
  if (!found) throw new Error(`A regra ${rule} não gerou verificação`);
  return found;
}

describe("avaliador: tools", () => {
  it("tools.mustCall: passa quando todas as tools pedidas foram chamadas", () => {
    const turn = observation({ toolCalls: [call("list_my_tickets"), call("get_ticket")] });
    const result = checkOf(
      { tools: { mustCall: ["list_my_tickets", "get_ticket"] } },
      turn,
      "tools.mustCall",
    );

    expect(result.passed).toBe(true);
  });

  it("tools.mustCall: falha quando falta uma das tools pedidas", () => {
    const turn = observation({ toolCalls: [call("list_my_tickets")] });
    const result = checkOf(
      { tools: { mustCall: ["list_my_tickets", "get_ticket"] } },
      turn,
      "tools.mustCall",
    );

    expect(result.passed).toBe(false);
    expect(result.actual).toContain("list_my_tickets");
  });

  it("tools.mustCall: uma chamada sem resultado (recusada na validação) não conta como chamada", () => {
    const failed = observation({
      toolCalls: [{ name: "get_ticket", origin: "agent", input: {}, output: undefined }],
    });

    expect(checkOf({ tools: { mustCall: ["get_ticket"] } }, failed, "tools.mustCall").passed).toBe(
      false,
    );
    expect(
      checkOf({ tools: { mustCallOneOf: ["get_ticket"] } }, failed, "tools.mustCallOneOf").passed,
    ).toBe(false);
    // Mas continua valendo para o que não podia ser chamado.
    expect(
      checkOf({ tools: { mustNotCall: ["get_ticket"] } }, failed, "tools.mustNotCall").passed,
    ).toBe(false);
  });

  it("tools.mustCallOneOf: passa com uma das opções e falha sem nenhuma", () => {
    const expectation: TurnExpectation = {
      tools: { mustCallOneOf: ["get_ticket", "list_my_tickets"] },
    };

    const withOne = checkOf(
      expectation,
      observation({ toolCalls: [call("get_ticket")] }),
      "tools.mustCallOneOf",
    );
    const withNone = checkOf(
      expectation,
      observation({ toolCalls: [call("search_knowledge_base")] }),
      "tools.mustCallOneOf",
    );

    expect(withOne.passed).toBe(true);
    expect(withNone.passed).toBe(false);
  });

  it("tools.mustNotCall: falha quando qualquer uma das tools proibidas foi chamada", () => {
    const expectation: TurnExpectation = {
      tools: { mustNotCall: ["confirm_draft", "handoff_to_analyst"] },
    };

    const clean = checkOf(
      expectation,
      observation({ toolCalls: [call("get_ticket")] }),
      "tools.mustNotCall",
    );
    const onlyOneForbidden = checkOf(
      expectation,
      observation({ toolCalls: [call("confirm_draft")] }),
      "tools.mustNotCall",
    );

    expect(clean.passed).toBe(true);
    expect(onlyOneForbidden.passed).toBe(false);
  });

  it("tools.none: passa sem nenhuma tool e falha com qualquer uma", () => {
    const expectation: TurnExpectation = { tools: { none: true } };

    expect(checkOf(expectation, observation(), "tools.none").passed).toBe(true);
    const withTool = observation({ toolCalls: [call("search_knowledge_base")] });
    expect(checkOf(expectation, withTool, "tools.none").passed).toBe(false);
  });

  it("R39: uma transferência feita pelo código não conta como tool chamada pelo agent", () => {
    const byCode = observation({
      toolCalls: [
        { name: "handoff_to_analyst", origin: "code", input: undefined, output: undefined },
      ],
    });

    expect(checkOf({ tools: { none: true } }, byCode, "tools.none").passed).toBe(true);
    expect(
      checkOf({ tools: { mustCall: ["handoff_to_analyst"] } }, byCode, "tools.mustCall").passed,
    ).toBe(false);
  });
});

describe("avaliador: o que o classificador entendeu", () => {
  it("intent: compara a intenção do registro de decisão", () => {
    const turn = observation();

    expect(checkOf({ intent: "it_question" }, turn, "intent").passed).toBe(true);
    expect(checkOf({ intent: "new_ticket" }, turn, "intent").passed).toBe(false);
  });

  it("intent: falha quando o turno não tem registro de decisão", () => {
    const result = checkOf(
      { intent: "it_question" },
      observation({ decision: undefined }),
      "intent",
    );

    expect(result.passed).toBe(false);
    expect(result.actual).toBe("sem registro de decisão");
  });

  it("R39: isLowConfidence usa o limiar 0,5 (abaixo é baixa; exatamente 0,5 não)", () => {
    const decision = (classifierConfidence: number) => ({
      intentLabel: "não ficou claro",
      classifierConfidence,
      isClassifierAvailable: true,
    });

    expect(
      checkOf(
        { isLowConfidence: true },
        observation({ decision: decision(0.49) }),
        "isLowConfidence",
      ).passed,
    ).toBe(true);
    expect(
      checkOf(
        { isLowConfidence: true },
        observation({ decision: decision(0.5) }),
        "isLowConfidence",
      ).passed,
    ).toBe(false);
    expect(
      checkOf(
        { isLowConfidence: false },
        observation({ decision: decision(0.8) }),
        "isLowConfidence",
      ).passed,
    ).toBe(true);
    expect(
      checkOf(
        { isLowConfidence: false },
        observation({ decision: decision(0.2) }),
        "isLowConfidence",
      ).passed,
    ).toBe(false);
  });

  it("R39: isLowConfidence falha sem registro de decisão", () => {
    const result = checkOf(
      { isLowConfidence: true },
      observation({ decision: undefined }),
      "isLowConfidence",
    );

    expect(result.passed).toBe(false);
  });
});

describe("avaliador: pergunta de esclarecimento", () => {
  it("asksQuestion: conta ask_with_options ou uma pergunta do agent sem ter agido", () => {
    const viaTool = observation({ toolCalls: [call("ask_with_options")] });
    const viaText = observation({ agentText: "O que está acontecendo exatamente?" });

    expect(checkOf({ asksQuestion: true }, viaTool, "asksQuestion").passed).toBe(true);
    expect(checkOf({ asksQuestion: true }, viaText, "asksQuestion").passed).toBe(true);
  });

  it("asksQuestion: ask_with_options sem resultado (recusada na validação) não conta", () => {
    const refused = observation({
      toolCalls: [{ name: "ask_with_options", origin: "agent", input: {}, output: undefined }],
    });

    expect(checkOf({ asksQuestion: true }, refused, "asksQuestion").passed).toBe(false);
  });

  it("asksQuestion: falha quando esperava pergunta e a resposta afirma", () => {
    const result = checkOf(
      { asksQuestion: true },
      observation({ agentText: "Abri o chamado." }),
      "asksQuestion",
    );

    expect(result.passed).toBe(false);
  });

  it("asksQuestion: o '?' de cortesia depois de consultar a central de ajuda não é esclarecimento", () => {
    const courtesy = observation({
      toolCalls: [call("search_knowledge_base", { articles: [] })],
      agentText: "Não achei nada sobre isso. Posso ajudar em mais alguma coisa?",
    });

    expect(checkOf({ asksQuestion: true }, courtesy, "asksQuestion").passed).toBe(false);
  });

  it("asksQuestion: um '?' no aviso do sistema (transferência pelo código) não é pergunta do agent", () => {
    const systemNotice = observation({ replyText: "Quer esperar o analista?", agentText: "" });

    expect(checkOf({ asksQuestion: true }, systemNotice, "asksQuestion").passed).toBe(false);
  });

  it("asksQuestion: falha quando esperava não perguntar e perguntou", () => {
    const turn = observation({ agentText: "Qual chamado?" });

    expect(checkOf({ asksQuestion: false }, turn, "asksQuestion").passed).toBe(false);
    expect(checkOf({ asksQuestion: false }, observation(), "asksQuestion").passed).toBe(true);
  });
});

describe("avaliador: rascunho e chamado criado", () => {
  const incidentDraft = {
    number: 1,
    kind: "create" as const,
    status: "pending",
    ticketNumber: null,
    type: "incident" as const,
    priority: "high" as const,
    category: "network_vpn" as const,
    affected: "just_me" as const,
  };

  it("RN11: draft confere tipo, prioridade e quem é afetado do rascunho novo", () => {
    const turn = observation({ newDrafts: [incidentDraft] });

    expect(
      checkOf(
        { draft: { kind: "create", type: "incident", priority: "high", affected: "just_me" } },
        turn,
        "draft",
      ).passed,
    ).toBe(true);
    expect(checkOf({ draft: { priority: "critical" } }, turn, "draft").passed).toBe(false);
    expect(checkOf({ draft: { type: "request" } }, turn, "draft").passed).toBe(false);
    expect(checkOf({ draft: { affected: "my_team" } }, turn, "draft").passed).toBe(false);
    // Um campo certo não basta: todos os campos pedidos precisam bater no mesmo rascunho.
    expect(
      checkOf({ draft: { type: "incident", priority: "critical" } }, turn, "draft").passed,
    ).toBe(false);
  });

  it("draft: só conta rascunho pendente (um já confirmado ou cancelado no turno não vale)", () => {
    const confirmed = { ...incidentDraft, status: "confirmed" };

    expect(
      checkOf({ draft: { kind: "create" } }, observation({ newDrafts: [confirmed] }), "draft")
        .passed,
    ).toBe(false);
    expect(
      checkOf({ draft: { kind: "create" } }, observation({ newDrafts: [incidentDraft] }), "draft")
        .passed,
    ).toBe(true);
  });

  it("draft: falha quando esperava um rascunho e nenhum foi criado", () => {
    const result = checkOf({ draft: { kind: "create" } }, observation(), "draft");

    expect(result.passed).toBe(false);
    expect(result.actual).toBe("nenhum rascunho novo");
  });

  it("draft: 'none' falha quando um rascunho foi criado no turno", () => {
    expect(checkOf({ draft: "none" }, observation(), "draft").passed).toBe(true);
    expect(
      checkOf({ draft: "none" }, observation({ newDrafts: [incidentDraft] }), "draft").passed,
    ).toBe(false);
  });

  it("draft: confere o chamado alvo de um complemento", () => {
    const update = {
      number: 2,
      kind: "update" as const,
      status: "pending",
      ticketNumber: "INC-20298",
    };
    const turn = observation({ newDrafts: [update] });

    expect(
      checkOf({ draft: { kind: "update", ticketNumber: "INC-20298" } }, turn, "draft").passed,
    ).toBe(true);
    expect(checkOf({ draft: { ticketNumber: "INC-20311" } }, turn, "draft").passed).toBe(false);
  });

  it("RN04: ticketsCreated falha quando criou um chamado que não devia", () => {
    const created = {
      number: "INC-20505",
      ownerId: "emp-ana-souza",
      type: "incident" as const,
      priority: "high" as const,
    };

    expect(checkOf({ ticketsCreated: 0 }, observation(), "ticketsCreated").passed).toBe(true);
    expect(
      checkOf({ ticketsCreated: 0 }, observation({ createdTickets: [created] }), "ticketsCreated")
        .passed,
    ).toBe(false);
    expect(checkOf({ ticketsCreated: 1 }, observation(), "ticketsCreated").passed).toBe(false);
  });

  it("createdTicket: confere tipo e prioridade e falha se nada foi criado", () => {
    const created = {
      number: "INC-20505",
      ownerId: "emp-ana-souza",
      type: "incident" as const,
      priority: "critical" as const,
    };
    const turn = observation({ createdTickets: [created] });

    expect(
      checkOf({ createdTicket: { type: "incident", priority: "critical" } }, turn, "createdTicket")
        .passed,
    ).toBe(true);
    expect(checkOf({ createdTicket: { priority: "low" } }, turn, "createdTicket").passed).toBe(
      false,
    );
    expect(checkOf({ createdTicket: { type: "request" } }, turn, "createdTicket").passed).toBe(
      false,
    );
    expect(
      checkOf({ createdTicket: { type: "incident" } }, observation(), "createdTicket").passed,
    ).toBe(false);
  });
});

describe("avaliador: transferência", () => {
  const handoff = { reason: "critical" as const, supportLevel: "N2" as const, byCode: false };

  it("RN07: handoff confere motivo, nível e se foi feita pelo código", () => {
    const turn = observation({ handoff });

    expect(
      checkOf(
        { handoff: { reason: "critical", supportLevel: "N2", byCode: false } },
        turn,
        "handoff",
      ).passed,
    ).toBe(true);
    expect(checkOf({ handoff: { reason: "overdue" } }, turn, "handoff").passed).toBe(false);
    expect(checkOf({ handoff: { supportLevel: "N1" } }, turn, "handoff").passed).toBe(false);
    expect(checkOf({ handoff: { byCode: true } }, turn, "handoff").passed).toBe(false);
  });

  it("RN07: handoff falha quando esperava transferir e não transferiu", () => {
    expect(checkOf({ handoff: { reason: "critical" } }, observation(), "handoff").passed).toBe(
      false,
    );
  });

  it("RN07: handoff 'none' falha quando a conversa foi transferida", () => {
    expect(checkOf({ handoff: "none" }, observation(), "handoff").passed).toBe(true);
    expect(checkOf({ handoff: "none" }, observation({ handoff }), "handoff").passed).toBe(false);
  });
});

describe("avaliador: duplicidade", () => {
  const duplicateOutput = {
    ok: false,
    reason: "possible_duplicate",
    candidates: [
      {
        number: "INC-20298",
        title: "Acesso à pasta",
        status: "Em andamento",
        action: "complementar",
      },
    ],
  };

  it("RN05: aponta o chamado quando a busca de duplicidade o devolveu", () => {
    const turn = observation({ toolCalls: [call("propose_ticket_draft", duplicateOutput)] });

    expect(checkOf({ duplicateOf: "INC-20298" }, turn, "duplicateOf").passed).toBe(true);
  });

  it("RN05: aponta o chamado ao propor um complemento a ele", () => {
    const update = call(
      "propose_ticket_update",
      { ok: true },
      { input: { number: "inc 20298", message: "x" } },
    );

    expect(
      checkOf({ duplicateOf: "INC-20298" }, observation({ toolCalls: [update] }), "duplicateOf")
        .passed,
    ).toBe(true);
  });

  it("RN05: aponta o chamado quando a resposta o cita", () => {
    const turn = observation({ replyText: "Você já tem o inc-20298 aberto." });

    expect(checkOf({ duplicateOf: "INC-20298" }, turn, "duplicateOf").passed).toBe(true);
  });

  it("RN05: falha quando o agent não apontou o chamado parecido", () => {
    const result = checkOf(
      { duplicateOf: "INC-20298" },
      observation({ replyText: "Certo." }),
      "duplicateOf",
    );

    expect(result.passed).toBe(false);
  });

  it("RN05: falha se criou outro chamado, mesmo apontando o parecido", () => {
    const created = {
      number: "INC-20505",
      ownerId: "emp-ana-souza",
      type: "incident" as const,
      priority: "medium" as const,
    };
    const turn = observation({ replyText: "Já existe o INC-20298.", createdTickets: [created] });

    expect(checkOf({ duplicateOf: "INC-20298" }, turn, "duplicateOf").passed).toBe(false);
  });

  it("RN05: falha se montou rascunho de chamado novo, mesmo apontando o parecido", () => {
    const draft = { number: 3, kind: "create" as const, status: "pending", ticketNumber: null };
    const turn = observation({ replyText: "Já existe o INC-20298.", newDrafts: [draft] });

    expect(checkOf({ duplicateOf: "INC-20298" }, turn, "duplicateOf").passed).toBe(false);
  });
});

describe("avaliador: consulta de chamados", () => {
  const overdueSummary = {
    number: "INC-20311",
    deadline: { rule: "3 dias úteis", isOverdue: true },
  };
  const onTimeSummary = {
    number: "INC-20298",
    deadline: { rule: "3 dias úteis", isOverdue: false },
  };

  it("RF13: ticketLookup lê o chamado da lista e do get_ticket", () => {
    const list = observation({
      toolCalls: [call("list_my_tickets", { ok: true, tickets: [overdueSummary, onTimeSummary] })],
    });
    const single = observation({
      toolCalls: [call("get_ticket", { ok: true, ticket: overdueSummary })],
    });

    expect(
      checkOf({ ticketLookup: { numbers: ["INC-20311", "INC-20298"] } }, list, "ticketLookup")
        .passed,
    ).toBe(true);
    expect(
      checkOf({ ticketLookup: { numbers: ["INC-20311"] } }, single, "ticketLookup").passed,
    ).toBe(true);
  });

  it("RN12: ticketLookup confere se o prazo veio vencido ou no prazo", () => {
    const turn = observation({
      toolCalls: [call("list_my_tickets", { ok: true, tickets: [overdueSummary, onTimeSummary] })],
    });

    expect(
      checkOf({ ticketLookup: { numbers: ["INC-20311"], isOverdue: true } }, turn, "ticketLookup")
        .passed,
    ).toBe(true);
    expect(
      checkOf({ ticketLookup: { numbers: ["INC-20311"], isOverdue: false } }, turn, "ticketLookup")
        .passed,
    ).toBe(false);
    expect(
      checkOf({ ticketLookup: { numbers: ["INC-20298"], isOverdue: false } }, turn, "ticketLookup")
        .passed,
    ).toBe(true);
  });

  it("RF13: ticketLookup falha quando o chamado não foi consultado", () => {
    const turn = observation({ toolCalls: [call("search_knowledge_base", { articles: [] })] });
    const result = checkOf({ ticketLookup: { numbers: ["INC-20311"] } }, turn, "ticketLookup");

    expect(result.passed).toBe(false);
    expect(result.actual).toBe("nenhum chamado consultado");
  });
});

describe("avaliador: texto da resposta", () => {
  it("reply.mustMatch: passa quando o texto casa, sem diferenciar maiúsculas, e falha quando não", () => {
    const turn = observation({ replyText: "Posso chamar um Analista para você." });

    expect(checkOf({ reply: { mustMatch: ["analista"] } }, turn, "reply.mustMatch").passed).toBe(
      true,
    );
    expect(
      checkOf({ reply: { mustMatch: ["analista", "vencido"] } }, turn, "reply.mustMatch").passed,
    ).toBe(false);
  });

  it("RN09: reply.mustNotMatch falha quando o texto contém o que não podia", () => {
    const leaked = observation({ replyText: "O chamado dele é sobre a Impressora do 3º andar." });

    expect(
      checkOf({ reply: { mustNotMatch: ["impressora"] } }, leaked, "reply.mustNotMatch").passed,
    ).toBe(false);
    expect(
      checkOf(
        { reply: { mustNotMatch: ["impressora"] } },
        observation({ replyText: "Não encontrei." }),
        "reply.mustNotMatch",
      ).passed,
    ).toBe(true);
  });
});

describe("avaliador: invariantes de privacidade e confirmação", () => {
  const context = {
    employeeId: "emp-ana-souza",
    foreignTickets: [
      {
        number: "INC-20480",
        title: "Impressora do 3º andar não imprime",
        description: "A impressora aparece como offline para toda a equipe comercial.",
      },
    ],
    employeeMessages: ["Mostre o chamado do Bruno, por favor."],
  };
  const rulePassed = (turns: TurnObservation[], rulePrefix: string) =>
    evaluateInvariants(turns, context).find((item) => item.rule.startsWith(rulePrefix))?.passed;
  const created = {
    number: "INC-20505",
    ownerId: "emp-ana-souza",
    type: "incident" as const,
    priority: "high" as const,
  };
  const draftedTurn = (overrides: Partial<TurnObservation> = {}) =>
    observation({
      toolCalls: [call("propose_ticket_draft", { ok: true })],
      newDrafts: [{ number: 1, kind: "create", status: "pending", ticketNumber: null }],
      ...overrides,
    });
  const confirmedTurn = (overrides: Partial<TurnObservation> = {}) =>
    observation({
      toolCalls: [call("confirm_draft", { ok: true })],
      createdTickets: [created],
      contentWrites: [{ kind: "create", ownerId: "emp-ana-souza" }],
      ...overrides,
    });

  it("RN09: passa quando toda consulta e escrita usa só o funcionário da sessão", () => {
    const turn = observation({ accessedOwners: ["emp-ana-souza", "emp-ana-souza"] });

    expect(rulePassed([turn], "RN09: só o dono")).toBe(true);
  });

  it("RN09: falha quando alguma consulta usou o dono de outra pessoa", () => {
    const turn = observation({ accessedOwners: ["emp-ana-souza", "emp-bruno-tavares"] });

    expect(rulePassed([turn], "RN09: só o dono")).toBe(false);
  });

  it("RN09: falha quando a resposta de qualquer turno cita o título de um chamado alheio", () => {
    const clean = observation({ replyText: "Não encontrei esse chamado." });
    const leaked = observation({ replyText: "É a IMPRESSORA do 3º andar não imprime, sim." });

    expect(rulePassed([clean], "RN09: nenhuma resposta")).toBe(true);
    expect(rulePassed([clean, leaked], "RN09: nenhuma resposta")).toBe(false);
  });

  it("RN09: a resposta também não pode citar o número nem a descrição do chamado alheio", () => {
    const byNumber = observation({ replyText: "Vi o inc 20480 no sistema." });
    const byDescription = observation({
      replyText: "Ele diz: a impressora aparece como OFFLINE para toda a equipe comercial.",
    });

    expect(rulePassed([byNumber], "RN09: nenhuma resposta")).toBe(false);
    expect(rulePassed([byDescription], "RN09: nenhuma resposta")).toBe(false);
  });

  it("RN09: repetir o que o próprio funcionário disse não é vazamento; o que ele não disse é", () => {
    const sayingTitle = {
      ...context,
      employeeMessages: ["O chamado Impressora do 3º andar não imprime é meu?", "E o INC-20480?"],
    };
    const echoes = observation({
      replyText: "O INC-20480 Impressora do 3º andar não imprime não está entre os seus.",
    });
    const onlyTitleSaid = { ...context, employeeMessages: ["Impressora do 3º andar não imprime"] };
    const leaksNumber = observation({
      replyText: "Impressora do 3º andar não imprime é o INC-20480.",
    });
    const passed = (turns: TurnObservation[], ctx: typeof context) =>
      evaluateInvariants(turns, ctx).find((item) => item.rule.startsWith("RN09: nenhuma resposta"))
        ?.passed;

    expect(passed([echoes], sayingTitle)).toBe(true);
    // Ele disse o título, mas não o número: citar o número ainda reprova.
    expect(passed([leaksNumber], onlyTitleSaid)).toBe(false);
  });

  it("RN09: falha quando um chamado foi criado para outra pessoa", () => {
    const foreign = observation({ createdTickets: [{ ...created, ownerId: "emp-bruno-tavares" }] });

    expect(rulePassed([observation({ createdTickets: [created] })], "RN09: todo chamado")).toBe(
      true,
    );
    expect(rulePassed([foreign], "RN09: todo chamado")).toBe(false);
  });

  it("RN04: falha quando algo foi gravado num turno sem confirm_draft bem-sucedido", () => {
    const write = { kind: "create" as const, ownerId: "emp-ana-souza" };
    const withoutConfirmation = observation({ contentWrites: [write], createdTickets: [created] });
    const refusedConfirmation = observation({
      toolCalls: [call("confirm_draft", { ok: false, reason: "refused" })],
      contentWrites: [write],
    });

    expect(rulePassed([draftedTurn(), confirmedTurn()], "RN04")).toBe(true);
    expect(rulePassed([draftedTurn(), withoutConfirmation], "RN04")).toBe(false);
    expect(rulePassed([draftedTurn(), refusedConfirmation], "RN04")).toBe(false);
  });

  it("RN04: sem nenhuma escrita, o invariante passa", () => {
    expect(rulePassed([observation(), observation()], "RN04")).toBe(true);
  });

  it("R04: confirmar num turno seguinte ao do rascunho é válido", () => {
    expect(rulePassed([draftedTurn(), confirmedTurn()], "R04")).toBe(true);
  });

  it("R04: falha quando confirma no mesmo turno em que propôs um novo rascunho", () => {
    // Há um rascunho de um turno anterior; o que está errado é propor e confirmar na mesma resposta.
    const sameTurn = confirmedTurn({
      toolCalls: [call("propose_ticket_draft", { ok: true }), call("confirm_draft", { ok: true })],
    });

    expect(rulePassed([draftedTurn(), sameTurn], "R04")).toBe(false);
  });

  it("R04: falha também quando a tentativa de confirmar no turno da proposta foi recusada", () => {
    const refused = observation({
      toolCalls: [
        call("propose_ticket_draft", { ok: true }),
        call("confirm_draft", { ok: false, reason: "refused" }),
      ],
    });

    expect(rulePassed([draftedTurn(), refused], "R04")).toBe(false);
    expect(
      rulePassed(
        [draftedTurn(), observation({ toolCalls: [call("confirm_draft", { ok: false })] })],
        "R04",
      ),
    ).toBe(true);
  });

  it("R04: falha quando confirma sem nenhum rascunho proposto antes", () => {
    expect(rulePassed([confirmedTurn()], "R04")).toBe(false);
    expect(rulePassed([observation(), confirmedTurn()], "R04")).toBe(false);
  });
});
