import { describe, expect, it } from "vitest";
import { describeToolAction } from "./tool-actions.ts";

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
});
