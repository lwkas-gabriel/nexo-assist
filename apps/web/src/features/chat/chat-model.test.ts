import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { DraftView, SessionView } from "./chat-api.ts";
import {
  confirmableDraft,
  lastEmployeeMessage,
  liveDraft,
  messageAuthor,
  proposedDraft,
  quickOptionsOf,
  sessionSummaryIndex,
} from "./chat-model.ts";

const draft = (number: number, status: DraftView["status"] = "pending"): DraftView => ({
  draftId: `D-${number}`,
  number,
  kind: "create",
  status,
  ticketNumber: null,
});

function agentWithTool(id: string, toolName: string, output: unknown): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: `tool-${toolName}`,
        toolCallId: `c-${id}`,
        state: "output-available",
        input: {},
        output,
      },
    ],
  };
}

const message = (id: string, metadata?: Record<string, unknown>): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: "oi" }],
  ...(metadata ? { metadata } : {}),
});

describe("leitura das mensagens do chat", () => {
  it("autor vem dos metadados; sem eles, do papel", () => {
    expect(messageAuthor(message("1", { author: "system" }))).toBe("system");
    expect(messageAuthor({ id: "2", role: "user", parts: [] })).toBe("employee");
    expect(messageAuthor(message("3"))).toBe("agent");
  });

  it("RF07: acha o rascunho proposto e ignora a proposta que não deu certo", () => {
    expect(
      proposedDraft(agentWithTool("1", "propose_ticket_draft", { ok: true, draft: draft(4) })),
    ).toMatchObject({ draftId: "D-4" });
    expect(
      proposedDraft(
        agentWithTool("2", "propose_ticket_draft", { ok: false, reason: "incomplete" }),
      ),
    ).toBeUndefined();
  });

  it("RF06: lê a pergunta com opções rápidas", () => {
    const asked = agentWithTool("1", "ask_with_options", {
      ok: true,
      question: "Quem está sendo afetado?",
      options: ["Só eu", "Minha equipe"],
    });

    expect(quickOptionsOf(asked)).toEqual({
      question: "Quem está sendo afetado?",
      options: ["Só eu", "Minha equipe"],
    });
  });

  it("RF07: o card mostra o estado atual do rascunho, não o da hora da proposta", () => {
    expect(liveDraft(draft(4), [draft(4, "confirmed")]).status).toBe("confirmed");
    expect(liveDraft(draft(4), []).status).toBe("pending");
  });

  it("Ctrl/⌘+Enter confirma só o rascunho mais recente, e só se ainda dá para confirmar", () => {
    const messages = [
      agentWithTool("1", "propose_ticket_draft", { ok: true, draft: draft(1) }),
      agentWithTool("2", "propose_ticket_draft", { ok: true, draft: draft(2) }),
    ];

    expect(confirmableDraft(messages, [draft(1, "cancelled"), draft(2)])?.number).toBe(2);
    expect(confirmableDraft(messages, [draft(2, "confirm_failed")])?.number).toBe(2);
    expect(confirmableDraft(messages, [draft(2, "confirmed")])).toBeUndefined();
  });

  it("R03: o resumo da sessão anterior entra antes da primeira mensagem da sessão atual", () => {
    const session: SessionView = {
      agentMessages: 1,
      limit: 30,
      isAtLimit: false,
      startedAt: "2026-10-31T12:00:00.000Z",
      previousSummary: "Assuntos: dúvida de TI.",
    };
    const messages = [
      message("old", { createdAt: "2026-10-30T09:00:00.000Z" }),
      message("new", { createdAt: "2026-10-31T12:00:01.000Z" }),
    ];

    expect(sessionSummaryIndex(messages, session)).toBe(1);
    expect(sessionSummaryIndex(messages, { ...session, startedAt: null })).toBe(2);
    expect(sessionSummaryIndex(messages, { ...session, previousSummary: null })).toBeUndefined();
  });

  it("a mensagem que fica para o Tentar novamente é a última do funcionário", () => {
    const employee = (id: string): UIMessage => ({ id, role: "user", parts: [] });

    expect(lastEmployeeMessage([employee("1"), message("2"), employee("3"), message("4")])).toEqual(
      employee("3"),
    );
    expect(lastEmployeeMessage([message("1")])).toBeUndefined();
  });
});
