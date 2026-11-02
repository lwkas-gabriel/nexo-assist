import { describe, expect, it } from "vitest";
import { describeToolAction, hasTicketsUnavailable } from "./tool-actions.ts";
import { agentWithTool } from "./ticket.fixture.ts";

describe("describeToolAction", () => {
  it("descreve a busca na central de ajuda como no protótipo", () => {
    expect(describeToolAction("search_knowledge_base")).toBe("buscou na central de ajuda");
  });

  it("descreve as consultas de chamados como no protótipo", () => {
    expect(describeToolAction("list_my_tickets")).toBe("consultou seus chamados");
    expect(describeToolAction("get_ticket")).toBe("consultou o chamado");
  });

  it("descreve as ações de rascunho como no protótipo", () => {
    expect(describeToolAction("propose_ticket_draft", { ok: true })).toBe("montou o rascunho");
    expect(describeToolAction("confirm_draft", { ok: true })).toBe("confirmou o rascunho");
  });

  it("descreve a transferência como no protótipo", () => {
    expect(describeToolAction("handoff_to_analyst", { ok: true })).toBe("chamou um analista");
  });

  it("não dá por feita a ação que a tool recusou (ex.: confirmação fora de hora)", () => {
    expect(describeToolAction("confirm_draft", { ok: false, reason: "refused" })).toBe(
      "confirmou o rascunho (não concluiu)",
    );
  });

  it("tem um rótulo genérico para ações ainda sem descrição", () => {
    expect(describeToolAction("tool_nova")).toBe("executou uma ação");
  });

  it("tela 3: a consulta de um chamado diz qual", () => {
    expect(describeToolAction("get_ticket", { ok: true, ticket: { number: "INC-20311" } })).toBe(
      "consultou o INC-20311",
    );
    expect(describeToolAction("get_ticket")).toBe("consultou o chamado");
  });

  it("10.5: sistema de chamados fora do ar diz quantas vezes tentou, com a constante do shared", () => {
    const output = { ok: false, reason: "tickets_unavailable" };

    expect(describeToolAction("list_my_tickets", output)).toBe(
      "sistema de chamados instável, tentei 3×",
    );
    expect(describeToolAction("get_ticket", output)).toBe(
      "sistema de chamados instável, tentei 3×",
    );
  });

  it("outros motivos continuam como não concluiu, sem código interno na tela", () => {
    const label = describeToolAction("get_ticket", { ok: false, reason: "not_found" });

    expect(label).toBe("consultou o chamado (não concluiu)");
    expect(label).not.toContain("not_found");
  });

  it("hasTicketsUnavailable: só quando a tool terminou com esse motivo", () => {
    const unavailable = { ok: false, reason: "tickets_unavailable" };

    expect(hasTicketsUnavailable(agentWithTool("a-1", "list_my_tickets", unavailable))).toBe(true);
    expect(
      hasTicketsUnavailable(agentWithTool("a-2", "get_ticket", { ok: false, reason: "not_found" })),
    ).toBe(false);
    expect(hasTicketsUnavailable(agentWithTool("a-3", "list_my_tickets", { ok: true }))).toBe(
      false,
    );
  });
});
