import { describe, expect, it } from "vitest";
import { describeToolAction } from "./tool-actions.ts";

describe("describeToolAction", () => {
  it("descreve a busca na central de ajuda como no protótipo", () => {
    expect(describeToolAction("search_knowledge_base")).toBe("buscou na central de ajuda");
  });

  it("tem um rótulo genérico para ações ainda sem descrição", () => {
    expect(describeToolAction("tool_nova")).toBe("executou uma ação");
  });
});
