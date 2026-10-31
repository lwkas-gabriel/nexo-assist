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

  it("tem um rótulo genérico para ações ainda sem descrição", () => {
    expect(describeToolAction("tool_nova")).toBe("executou uma ação");
  });
});
