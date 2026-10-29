import { describe, expect, it } from "vitest";
import { validateTicketDraft } from "./ticket-draft.ts";

const completeDraft = {
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  type: "incident",
  category: "network_vpn",
  priority: "high",
  affected: "just_me",
};

describe("validateTicketDraft", () => {
  it("RN03: aceita o rascunho com todos os campos", () => {
    const result = validateTicketDraft(completeDraft);

    expect(result).toEqual({ isComplete: true, draft: completeDraft });
  });

  it("RN03: lista o que falta, na ordem em que o agent deve perguntar", () => {
    const result = validateTicketDraft({ title: completeDraft.title, type: "incident" });

    expect(result).toEqual({
      isComplete: false,
      incompleteFields: ["description", "category", "affected", "priority"],
    });
  });

  it("RN02: recusa categoria fora das seis do Anexo A", () => {
    const result = validateTicketDraft({ ...completeDraft, category: "impressoras" });

    expect(result).toEqual({ isComplete: false, incompleteFields: ["category"] });
  });

  it("RN03: descrição curta demais não basta para o analista", () => {
    const result = validateTicketDraft({ ...completeDraft, description: "não vai" });

    expect(result).toEqual({ isComplete: false, incompleteFields: ["description"] });
  });

  it("remove espaços sobrando do título e da descrição", () => {
    const result = validateTicketDraft({ ...completeDraft, title: `  ${completeDraft.title}  ` });

    expect(result.isComplete && result.draft.title).toBe(completeDraft.title);
  });
});
